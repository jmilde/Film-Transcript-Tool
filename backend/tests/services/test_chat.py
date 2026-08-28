import uuid
from decimal import Decimal

import pytest
from app.agents import transcript_search as agent_module
from app.agents.transcript_search import transcript_agent
from app.core.errors import NotFoundError
from app.models.chat import ChatConversation, ChatMessage
from app.models.embedding import EMBEDDING_DIMENSION, TranscriptChunk
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.models.user import User
from app.models.video import Video
from app.services.chat import answer_question
from pydantic_ai.models.test import TestModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _seed_chunk(db: Session, user: User) -> tuple[Project, TranscriptChunk]:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    transcript = Transcript(
        video_id=video.id,
        project_id=project.id,
        language="en",
        type=TranscriptType.ORIGINAL,
        created_by=user.id,
    )
    db.add(transcript)
    db.flush()
    segment = TranscriptSegment(transcript_id=transcript.id, position=Decimal(1))
    db.add(segment)
    db.flush()
    token = TranscriptToken(
        transcript_id=transcript.id,
        segment_id=segment.id,
        project_id=project.id,
        original_text="hello",
        start_time=0.0,
        end_time=1.0,
        position=Decimal(1),
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(token)
    db.flush()
    chunk = TranscriptChunk(
        transcript_id=transcript.id,
        video_id=video.id,
        project_id=project.id,
        language="en",
        segment_id=segment.id,
        start_token_id=token.id,
        end_token_id=token.id,
        start_time=0.0,
        end_time=1.0,
        speaker_name="Alice",
        chunk_index=0,
        text="hello",
        search_vector=func.to_tsvector("english", "hello"),
        embedding=[0.0] * EMBEDDING_DIMENSION,
        embedding_model="test",
    )
    db.add(chunk)
    db.flush()
    return project, chunk


def _install_fake_retrieval(monkeypatch: pytest.MonkeyPatch, chunk: TranscriptChunk) -> None:
    monkeypatch.setattr(
        agent_module,
        "search_chunks",
        lambda session, project_id, query: [chunk],
    )


def _answer_with(model: TestModel, *args: object, **kwargs: object) -> ChatMessage:
    with transcript_agent.override(model=model):
        return answer_question(*args, **kwargs)  # type: ignore[arg-type]


def test_answer_question_persists_messages_with_resolved_citations(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)
    model = TestModel(
        custom_output_args={
            "answer": "The video mentions hello.",
            "citations": [{"marker": 1, "chunk_id": str(chunk.id)}],
        }
    )

    assistant_message = _answer_with(
        model, db_session, project.id, None, "What does it say?", user_id=user.id
    )

    assert assistant_message.role == "assistant"
    assert assistant_message.content == "The video mentions hello."
    assert assistant_message.citations == [
        {
            "marker": 1,
            "chunk_id": str(chunk.id),
            "transcript_id": str(chunk.transcript_id),
            "video_id": str(chunk.video_id),
            "video_name": "clip",
            "segment_id": str(chunk.segment_id),
            "start_token_id": str(chunk.start_token_id),
            "end_token_id": str(chunk.end_token_id),
            "start_time": 0.0,
            "end_time": 1.0,
            "speaker_name": "Alice",
            "language": "en",
            "excerpt": "hello",
        }
    ]

    messages = list(
        db_session.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == assistant_message.conversation_id)
            .order_by(ChatMessage.created_at)
        ).scalars()
    )
    assert [m.role for m in messages] == ["user", "assistant"]
    assert messages[0].content == "What does it say?"
    assert messages[0].citations is None


def test_answer_question_creates_conversation_when_none_given(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)
    model = TestModel(custom_output_args={"answer": "Hi.", "citations": []})

    assistant_message = _answer_with(model, db_session, project.id, None, "Hi", user_id=user.id)

    conversation = db_session.get(ChatConversation, assistant_message.conversation_id)
    assert conversation is not None
    assert conversation.project_id == project.id
    assert conversation.agent_message_history is not None


def test_answer_question_titles_conversation_from_first_question(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)
    model = TestModel(custom_output_args={"answer": "Hi.", "citations": []})

    assistant_message = _answer_with(
        model, db_session, project.id, None, "  What's   this about?  ", user_id=user.id
    )

    conversation = db_session.get(ChatConversation, assistant_message.conversation_id)
    assert conversation is not None
    # Collapsed whitespace, not truncated (well under the length limit).
    assert conversation.title == "What's this about?"


def test_answer_question_does_not_retitle_an_existing_conversation(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)
    first_model = TestModel(custom_output_args={"answer": "first", "citations": []})
    first = _answer_with(
        first_model, db_session, project.id, None, "First question", user_id=user.id
    )

    second_model = TestModel(custom_output_args={"answer": "second", "citations": []})
    _answer_with(
        second_model,
        db_session,
        project.id,
        first.conversation_id,
        "Second question",
        user_id=user.id,
    )

    conversation = db_session.get(ChatConversation, first.conversation_id)
    assert conversation is not None
    assert conversation.title == "First question"


def test_answer_question_unknown_conversation_raises_not_found(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)
    model = TestModel(custom_output_args={"answer": "Hi.", "citations": []})

    with pytest.raises(NotFoundError):
        _answer_with(model, db_session, project.id, uuid.uuid4(), "Hi", user_id=user.id)


def test_answer_question_reuses_conversation_across_turns(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    _install_fake_retrieval(monkeypatch, chunk)

    first_model = TestModel(custom_output_args={"answer": "first answer", "citations": []})
    first = _answer_with(first_model, db_session, project.id, None, "Q1", user_id=user.id)
    conversation_id = first.conversation_id
    history_after_first = db_session.get(ChatConversation, conversation_id).agent_message_history  # type: ignore[union-attr]
    assert history_after_first is not None

    second_model = TestModel(custom_output_args={"answer": "second answer", "citations": []})
    second = _answer_with(
        second_model, db_session, project.id, conversation_id, "Q2", user_id=user.id
    )

    assert second.conversation_id == conversation_id
    all_messages = list(
        db_session.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at)
        ).scalars()
    )
    assert [m.content for m in all_messages] == ["Q1", "first answer", "Q2", "second answer"]

    history_after_second = db_session.get(ChatConversation, conversation_id).agent_message_history  # type: ignore[union-attr]
    assert history_after_second is not None
    # The second turn's history carries strictly more messages than the first.
    assert len(history_after_second["messages"]) > len(history_after_first["messages"])
