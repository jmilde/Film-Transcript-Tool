import uuid
from collections.abc import Callable
from decimal import Decimal

import pytest
from app.agents import transcript_search as agent_module
from app.agents.transcript_search import transcript_agent
from app.models.chat import ChatConversation
from app.models.embedding import EMBEDDING_DIMENSION, TranscriptChunk
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.models.user import User
from app.models.video import Video
from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel
from sqlalchemy import func
from sqlalchemy.orm import Session


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    return project


def _install_no_op_retrieval(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_module, "search_chunks", lambda session, project_id, query: [])


def _seed_chunk(db: Session, user: User) -> tuple[Project, TranscriptChunk]:
    project = _project(db, user)
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


def test_ask_returns_answer_and_persists_conversation(
    auth_client: TestClient, db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    _install_no_op_retrieval(monkeypatch)
    model = TestModel(custom_output_args={"answer": "Hello there.", "citations": []})

    with transcript_agent.override(model=model):
        resp = auth_client.post(
            f"/projects/{project.id}/chat", json={"question": "What's in this project?"}
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["message"]["role"] == "assistant"
    assert body["message"]["content"] == "Hello there."
    assert body["message"]["citations"] == []
    conversation_id = body["conversation_id"]
    assert body["message"]["id"]

    conversation = db_session.get(ChatConversation, uuid.UUID(conversation_id))
    assert conversation is not None
    assert conversation.project_id == project.id


def test_ask_enriches_citations_with_folder_path_and_thumbnail_token(
    auth_client: TestClient, db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, chunk = _seed_chunk(db_session, user)
    monkeypatch.setattr(agent_module, "search_chunks", lambda session, project_id, query: [chunk])
    model = TestModel(
        custom_output_args={
            "answer": "It says hello [1].",
            "citations": [{"marker": 1, "chunk_id": str(chunk.id)}],
        }
    )

    with transcript_agent.override(model=model):
        resp = auth_client.post(f"/projects/{project.id}/chat", json={"question": "What?"})

    assert resp.status_code == 200
    citation = resp.json()["message"]["citations"][0]
    assert citation["folder_path"] == ["F"]
    # No thumbnail asset was seeded for the video.
    assert citation["thumbnail_token"] is None


def test_ask_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _project(db_session, user)
    _install_no_op_retrieval(monkeypatch)
    model = TestModel(custom_output_args={"answer": "Hi.", "citations": []})

    other = app_client(other_user)
    with transcript_agent.override(model=model):
        resp = other.post(f"/projects/{project.id}/chat", json={"question": "Hi?"})

    assert resp.status_code == 403


def test_ask_unknown_conversation_from_another_project_not_found(
    auth_client: TestClient, db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_a = _project(db_session, user)
    project_b = _project(db_session, user)
    other_conversation = ChatConversation(
        project_id=project_b.id, created_by=user.id, updated_by=user.id
    )
    db_session.add(other_conversation)
    db_session.flush()
    _install_no_op_retrieval(monkeypatch)
    model = TestModel(custom_output_args={"answer": "Hi.", "citations": []})

    with transcript_agent.override(model=model):
        resp = auth_client.post(
            f"/projects/{project_a.id}/chat",
            json={"question": "Hi?", "conversation_id": str(other_conversation.id)},
        )

    assert resp.status_code == 404


def test_get_conversation_round_trips_citations(
    auth_client: TestClient, db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    _install_no_op_retrieval(monkeypatch)
    model = TestModel(custom_output_args={"answer": "Hello there.", "citations": []})

    with transcript_agent.override(model=model):
        ask_resp = auth_client.post(
            f"/projects/{project.id}/chat", json={"question": "What's in this project?"}
        )
    conversation_id = ask_resp.json()["conversation_id"]

    resp = auth_client.get(f"/projects/{project.id}/chat/{conversation_id}")

    assert resp.status_code == 200
    body = resp.json()
    assert [m["role"] for m in body] == ["user", "assistant"]
    assert body[0]["content"] == "What's in this project?"
    assert body[1]["content"] == "Hello there."
    assert body[1]["citations"] == []


def test_get_conversation_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    project = _project(db_session, user)
    conversation = ChatConversation(project_id=project.id, created_by=user.id, updated_by=user.id)
    db_session.add(conversation)
    db_session.flush()

    other = app_client(other_user)
    resp = other.get(f"/projects/{project.id}/chat/{conversation.id}")

    assert resp.status_code == 403


def test_get_conversation_unknown_id_not_found(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = _project(db_session, user)

    resp = auth_client.get(f"/projects/{project.id}/chat/{uuid.uuid4()}")

    assert resp.status_code == 404
