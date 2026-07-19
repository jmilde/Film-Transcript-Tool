from collections.abc import Callable

from app.models.folder import Folder
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.comments import create_comment
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _seed(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id))
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
    raw = load_deepgram_sample()  # words: hello there how are you
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    db.add(
        Speaker(
            video_id=video.id,
            project_id=project.id,
            provider_identifier="speaker_9",
            name="Interviewer",
        )
    )
    tokens = list(
        db.execute(
            select(TranscriptToken)
            .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position, TranscriptToken.position)
        )
        .scalars()
        .all()
    )
    create_comment(
        db,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Discussing the climate crisis",
        user_id=user.id,
    )
    db.flush()
    return project


def test_search_merges_sources(auth_client: TestClient, db_session: Session, user: User) -> None:
    project = _seed(db_session, user)

    hello = auth_client.get(f"/projects/{project.id}/search", params={"q": "hello"}).json()
    assert any(hit["kind"] == "transcript" and hit["text"] == "Hello" for hit in hello)

    interview = auth_client.get(f"/projects/{project.id}/search", params={"q": "interview"}).json()
    assert any(hit["kind"] == "speaker" for hit in interview)

    climate = auth_client.get(f"/projects/{project.id}/search", params={"q": "climate"}).json()
    assert any(hit["kind"] == "comment" for hit in climate)


def test_search_ranked_descending(auth_client: TestClient, db_session: Session, user: User) -> None:
    project = _seed(db_session, user)

    results = auth_client.get(f"/projects/{project.id}/search", params={"q": "hello"}).json()

    ranks = [hit["rank"] for hit in results]
    assert ranks == sorted(ranks, reverse=True)


def test_search_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    project = _seed(db_session, user)

    other = app_client(other_user)
    resp = other.get(f"/projects/{project.id}/search", params={"q": "hello"})

    assert resp.status_code == 403
