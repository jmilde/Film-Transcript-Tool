"""Live end-to-end semantic chat search test.

Exercises the real OpenRouter-backed agent, embeddings, and reranker against a
seeded transcript chunk — no mocks. Hits the network with a real key, so it is
marked ``integration`` (deselect with ``-m 'not integration'``) and skips when
no key is configured.
"""

from decimal import Decimal

import pytest
from app.config import get_settings
from app.embeddings import factory as embeddings_factory
from app.models.embedding import TranscriptChunk
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.models.user import User
from app.models.video import Video
from app.services.chat import answer_question
from sqlalchemy import func
from sqlalchemy.orm import Session

_SETTINGS = get_settings()

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        _SETTINGS.openrouter_api_key in ("", "placeholder"),
        reason="OPENROUTER_API_KEY not configured (real key required for the live call)",
    ),
]

_CHUNK_TEXT = (
    "The lighthouse keeper lit the lamp every evening at dusk to guide ships safely to harbor."
)


def test_answer_question_end_to_end(db_session: Session, user: User) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER)
    )
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()
    transcript = Transcript(
        video_id=video.id,
        project_id=project.id,
        language="en",
        type=TranscriptType.ORIGINAL,
        created_by=user.id,
    )
    db_session.add(transcript)
    db_session.flush()
    segment = TranscriptSegment(transcript_id=transcript.id, position=Decimal(1))
    db_session.add(segment)
    db_session.flush()
    token = TranscriptToken(
        transcript_id=transcript.id,
        segment_id=segment.id,
        project_id=project.id,
        original_text=_CHUNK_TEXT,
        start_time=0.0,
        end_time=5.0,
        position=Decimal(1),
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(token)
    db_session.flush()

    (embedding,) = embeddings_factory.get_embeddings_provider().embed([_CHUNK_TEXT])
    chunk = TranscriptChunk(
        transcript_id=transcript.id,
        video_id=video.id,
        project_id=project.id,
        language="en",
        segment_id=segment.id,
        start_token_id=token.id,
        end_token_id=token.id,
        start_time=0.0,
        end_time=5.0,
        speaker_name="Narrator",
        chunk_index=0,
        text=_CHUNK_TEXT,
        search_vector=func.to_tsvector("english", _CHUNK_TEXT),
        embedding=embedding,
        embedding_model=_SETTINGS.embeddings_model,
    )
    db_session.add(chunk)
    db_session.flush()

    message = answer_question(
        db_session, project.id, None, "What did the lighthouse keeper do?", user_id=user.id
    )

    assert message.content.strip()
    assert message.citations
    assert message.citations[0]["chunk_id"] == str(chunk.id)
    # The frontend splits `content` on inline `[n]` markers to interleave
    # citation cards — lock that the model actually emits them.
    assert f"[{message.citations[0]['marker']}]" in message.content
