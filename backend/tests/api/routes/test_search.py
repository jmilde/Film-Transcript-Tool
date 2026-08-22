from collections.abc import Callable
from decimal import Decimal

from app.models.asset import AssetType, VideoAsset
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.services.comments import create_comment
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    return project


def _video(db: Session, project: Project, user: User, name: str, folder: Folder) -> Video:
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
    return video


def _transcript_for(db: Session, video: Video, user: User) -> Transcript:
    raw = load_deepgram_sample()  # words: hello there how are you
    transcript = create_transcript_from_normalized(
        db, video, normalize(raw), raw, created_by=user.id
    )
    db.flush()
    return transcript


def _tokens(db: Session, transcript: Transcript) -> list[TranscriptToken]:
    return list(
        db.execute(
            select(TranscriptToken)
            .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
            .where(TranscriptToken.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position, TranscriptToken.position)
        )
        .scalars()
        .all()
    )


def _seed(db: Session, user: User) -> tuple[Project, Folder, Video, Transcript]:
    project = _project(db, user)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = _video(db, project, user, "clip", folder)
    transcript = _transcript_for(db, video, user)
    db.add(
        Speaker(
            video_id=video.id,
            project_id=project.id,
            provider_identifier="speaker_9",
            name="Interviewer",
        )
    )
    tokens = _tokens(db, transcript)
    create_comment(
        db,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Discussing the climate crisis",
        user_id=user.id,
    )
    db.flush()
    return project, folder, video, transcript


def test_search_groups_transcript_hit_by_video(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project, _folder, video, _transcript = _seed(db_session, user)

    body = auth_client.get(f"/projects/{project.id}/search", params={"q": "hello"}).json()

    assert body["total_videos"] == 1
    assert len(body["groups"]) == 1
    group = body["groups"][0]
    assert group["video_id"] == str(video.id)
    assert group["video_name"] == "clip"
    assert group["folder_path"] == ["F"]
    assert group["hit_count"] == 1
    assert any(hit["kind"] == "transcript" and hit["text"] == "Hello" for hit in group["hits"])


def test_search_speaker_and_comment_hits_grouped_with_video(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project, _folder, video, _transcript = _seed(db_session, user)

    interview = auth_client.get(f"/projects/{project.id}/search", params={"q": "interview"}).json()
    assert interview["groups"][0]["video_id"] == str(video.id)
    assert any(hit["kind"] == "speaker" for hit in interview["groups"][0]["hits"])

    climate = auth_client.get(f"/projects/{project.id}/search", params={"q": "climate"}).json()
    assert climate["groups"][0]["video_id"] == str(video.id)
    assert any(hit["kind"] == "comment" for hit in climate["groups"][0]["hits"])


def test_search_hits_ordered_by_start_time_speaker_last(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project, _folder, video, transcript = _seed(db_session, user)
    # Add a second matching token later in time, plus a speaker match, for "echo".
    segment_id = _tokens(db_session, transcript)[0].segment_id
    db_session.add(
        TranscriptToken(
            transcript_id=transcript.id,
            segment_id=segment_id,
            project_id=project.id,
            original_text="echo",
            edited_text=None,
            start_time=50.0,
            end_time=50.5,
            position=Decimal(100),
            created_by=user.id,
            updated_by=user.id,
        )
    )
    db_session.add(
        TranscriptToken(
            transcript_id=transcript.id,
            segment_id=segment_id,
            project_id=project.id,
            original_text="echo",
            edited_text=None,
            start_time=10.0,
            end_time=10.5,
            position=Decimal(101),
            created_by=user.id,
            updated_by=user.id,
        )
    )
    db_session.add(
        Speaker(
            video_id=video.id,
            project_id=project.id,
            provider_identifier="speaker_echo",
            name="Echo",
        )
    )
    db_session.flush()

    body = auth_client.get(f"/projects/{project.id}/search", params={"q": "echo"}).json()

    start_times = [hit["start_time"] for hit in body["groups"][0]["hits"]]
    assert start_times == [10.0, 50.0, None]


def test_search_pagination(auth_client: TestClient, db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video_a = _video(db_session, project, user, "a", folder)
    _transcript_for(db_session, video_a, user)
    video_b = _video(db_session, project, user, "b", folder)
    _transcript_for(db_session, video_b, user)

    first = auth_client.get(
        f"/projects/{project.id}/search", params={"q": "hello", "limit": 1, "offset": 0}
    ).json()
    second = auth_client.get(
        f"/projects/{project.id}/search", params={"q": "hello", "limit": 1, "offset": 1}
    ).json()

    assert first["total_videos"] == 2
    assert len(first["groups"]) == 1
    assert second["total_videos"] == 2
    assert len(second["groups"]) == 1
    assert first["groups"][0]["video_id"] != second["groups"][0]["video_id"]
    assert first["limit"] == 1
    assert second["offset"] == 1


def test_search_thumbnail_token_present_only_when_asset_exists(
    auth_client: TestClient, db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    with_thumb = _video(db_session, project, user, "with-thumb", folder)
    _transcript_for(db_session, with_thumb, user)
    db_session.add(
        VideoAsset(
            video_id=with_thumb.id,
            type=AssetType.THUMBNAIL,
            storage_path=f"videos/{with_thumb.id}/thumbnail.jpg",
            mime_type="image/jpeg",
        )
    )
    without_thumb = _video(db_session, project, user, "without-thumb", folder)
    _transcript_for(db_session, without_thumb, user)
    db_session.flush()

    body = auth_client.get(
        f"/projects/{project.id}/search", params={"q": "hello", "limit": 10}
    ).json()

    by_video = {g["video_id"]: g["thumbnail_token"] for g in body["groups"]}
    assert isinstance(by_video[str(with_thumb.id)], str)
    assert by_video[str(without_thumb.id)] is None


def test_search_non_member_forbidden(
    app_client: Callable[[User], TestClient],
    db_session: Session,
    user: User,
    other_user: User,
) -> None:
    project, _folder, _video, _transcript = _seed(db_session, user)

    other = app_client(other_user)
    resp = other.get(f"/projects/{project.id}/search", params={"q": "hello"})

    assert resp.status_code == 403
