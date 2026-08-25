import uuid
from collections.abc import Callable
from typing import Any

from app.core.errors import ConflictError, NotFoundError
from app.models.document import Document
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.documents import (
    DocumentContentInvalidError,
    create_document,
    delete_document,
    list_documents,
    resolve_clip_block,
    resolve_document_content,
    update_document,
)
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed_transcript(db: Session, user: User, name: str = "clip") -> Transcript:
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
        name=name,
        original_filename=f"{name}.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    raw = load_deepgram_sample()
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    return transcript


def _flat_tokens(db: Session, transcript: Transcript) -> list[TranscriptToken]:
    segments = (
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    tokens: list[TranscriptToken] = []
    for segment in segments:
        tokens.extend(
            db.execute(
                select(TranscriptToken)
                .where(TranscriptToken.segment_id == segment.id)
                .order_by(TranscriptToken.position)
            )
            .scalars()
            .all()
        )
    return tokens


def _clip_node(
    *,
    node_id: str,
    transcript_id: uuid.UUID,
    video_id: uuid.UUID,
    start_token_id: uuid.UUID,
    end_token_id: uuid.UUID,
) -> dict[str, object]:
    return {
        "type": "clipBlock",
        "attrs": {
            "nodeId": node_id,
            "transcriptId": str(transcript_id),
            "videoId": str(video_id),
            "startTokenId": str(start_token_id),
            "endTokenId": str(end_token_id),
            "note": None,
        },
    }


def test_create_list_update_delete_document(db_session: Session, user: User) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    document = create_document(db_session, project.id, user.id, "Narration draft")
    assert document.version == 1
    assert document.content == {"type": "doc", "content": []}

    listed = list_documents(db_session, project.id)
    assert [d.id for d in listed] == [document.id]

    updated = update_document(
        db_session,
        document,
        user_id=user.id,
        title="Renamed",
        content={"type": "doc", "content": [{"type": "paragraph"}]},
        expected_version=1,
    )
    assert updated.title == "Renamed"
    assert updated.version == 2

    delete_document(db_session, updated)
    assert db_session.get(Document, document.id) is None


def test_update_document_stale_version_conflict(db_session: Session, user: User) -> None:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    document = create_document(db_session, project.id, user.id, "Draft")

    try:
        update_document(
            db_session,
            document,
            user_id=user.id,
            title="Stale write",
            content=None,
            expected_version=999,
        )
        raise AssertionError("expected ConflictError")
    except ConflictError as exc:
        assert exc.details is not None
        assert exc.details["current_version"] == 1


def test_resolve_clip_block_spans_segments(db_session: Session, user: User) -> None:
    transcript = _seed_transcript(db_session, user)
    tokens = _flat_tokens(db_session, transcript)  # Hello there. | How are you?
    speaker = (
        db_session.execute(select(Speaker).where(Speaker.video_id == transcript.video_id))
        .scalars()
        .first()
    )
    assert speaker is not None
    speaker.name = "Alice"
    db_session.flush()

    clip = resolve_clip_block(
        db_session,
        project_id=transcript.project_id,
        transcript_id=transcript.id,
        start_token_id=tokens[0].id,
        end_token_id=tokens[-1].id,
    )

    assert clip.excerpt == "Hello there. How are you?"
    assert clip.start_time == tokens[0].start_time
    assert clip.end_time == tokens[-1].end_time
    assert clip.speaker_name == "Alice"
    assert clip.video_id == transcript.video_id


def test_resolve_clip_block_uses_edited_text(db_session: Session, user: User) -> None:
    transcript = _seed_transcript(db_session, user)
    tokens = _flat_tokens(db_session, transcript)
    tokens[0].edited_text = "Hey"
    db_session.flush()

    clip = resolve_clip_block(
        db_session,
        project_id=transcript.project_id,
        transcript_id=transcript.id,
        start_token_id=tokens[0].id,
        end_token_id=tokens[0].id,
    )

    assert clip.excerpt == "Hey"


def test_resolve_clip_block_cross_project_transcript_rejected(
    db_session: Session, user: User
) -> None:
    transcript_a = _seed_transcript(db_session, user, "a")
    transcript_b = _seed_transcript(db_session, user, "b")
    tokens_b = _flat_tokens(db_session, transcript_b)

    try:
        resolve_clip_block(
            db_session,
            project_id=transcript_a.project_id,
            transcript_id=transcript_b.id,
            start_token_id=tokens_b[0].id,
            end_token_id=tokens_b[0].id,
        )
        raise AssertionError("expected NotFoundError")
    except NotFoundError:
        pass


def test_resolve_document_content_multi_clip_batches_queries(
    db_session: Session, user: User
) -> None:
    transcript = _seed_transcript(db_session, user)
    tokens = _flat_tokens(db_session, transcript)

    doc_one = create_document(db_session, transcript.project_id, user.id, "Doc")
    doc_one.content = {
        "type": "doc",
        "content": [
            _clip_node(
                node_id="0",
                transcript_id=transcript.id,
                video_id=transcript.video_id,
                start_token_id=tokens[0].id,
                end_token_id=tokens[0].id,
            )
        ],
    }
    db_session.flush()

    doc_many = create_document(db_session, transcript.project_id, user.id, "Doc")
    doc_many.content = {
        "type": "doc",
        "content": [
            _clip_node(
                node_id=str(i),
                transcript_id=transcript.id,
                video_id=transcript.video_id,
                start_token_id=tokens[0].id,
                end_token_id=tokens[-1].id,
            )
            for i in range(4)
        ],
    }
    db_session.flush()

    def _count_queries(fn: Callable[[], dict[str, Any]]) -> int:
        count = 0

        def _increment(*_args: object, **_kwargs: object) -> None:
            nonlocal count
            count += 1

        conn = db_session.connection()
        event.listen(conn, "before_cursor_execute", _increment)
        try:
            fn()
        finally:
            event.remove(conn, "before_cursor_execute", _increment)
        return count

    count_one = _count_queries(lambda: resolve_document_content(db_session, doc_one))
    count_many = _count_queries(lambda: resolve_document_content(db_session, doc_many))

    assert count_many == count_one

    resolved = resolve_document_content(db_session, doc_many)
    for node in resolved["content"]:
        assert node["attrs"]["excerpt"] == "Hello there. How are you?"
        assert node["attrs"]["video_name"] == "clip"


def test_update_document_rejects_clip_block_outside_project(
    db_session: Session, user: User
) -> None:
    transcript_a = _seed_transcript(db_session, user, "a")
    transcript_b = _seed_transcript(db_session, user, "b")
    tokens_b = _flat_tokens(db_session, transcript_b)
    document = create_document(db_session, transcript_a.project_id, user.id, "Doc")

    content = {
        "type": "doc",
        "content": [
            _clip_node(
                node_id="0",
                transcript_id=transcript_b.id,
                video_id=transcript_b.video_id,
                start_token_id=tokens_b[0].id,
                end_token_id=tokens_b[0].id,
            )
        ],
    }

    try:
        update_document(
            db_session,
            document,
            user_id=user.id,
            title=None,
            content=content,
            expected_version=1,
        )
        raise AssertionError("expected DocumentContentInvalidError")
    except DocumentContentInvalidError:
        pass
