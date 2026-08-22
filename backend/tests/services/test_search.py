import uuid
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
from app.services.search import MAX_HITS_PER_VIDEO, group_search_hits, search_project
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.transcription.deepgram_fixture import load_deepgram_sample


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    return project


def _transcript(db: Session, project: Project, user: User, name: str) -> Transcript:
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


def test_search_matches_transcript_text(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")

    hits = search_project(db_session, project.id, "hello")

    token_hits = [hit for hit in hits if hit.kind == "transcript"]
    assert len(token_hits) == 1
    # Displayed text keeps its original case; the tsvector match is case-folded.
    assert token_hits[0].text == "Hello"
    assert token_hits[0].video_id == transcript.video_id
    assert token_hits[0].start_time is not None


def test_search_excludes_deleted_tokens(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    hello = next(
        token for token in _tokens(db_session, transcript) if token.original_text == "Hello"
    )
    hello.is_deleted = True
    db_session.flush()

    hits = search_project(db_session, project.id, "hello")

    assert [hit for hit in hits if hit.kind == "transcript"] == []


def test_search_matches_speaker_name_stemmed(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    speaker = Speaker(
        video_id=transcript.video_id,
        project_id=project.id,
        provider_identifier="speaker_9",
        name="Interviewer",
    )
    db_session.add(speaker)
    db_session.flush()

    # "interview" stems to the same root as "Interviewer".
    hits = search_project(db_session, project.id, "interview")

    speaker_hits = [hit for hit in hits if hit.kind == "speaker"]
    assert len(speaker_hits) == 1
    assert speaker_hits[0].id == speaker.id
    assert speaker_hits[0].text == "Interviewer"
    assert speaker_hits[0].start_time is None


def test_search_matches_comment_stemmed(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript)
    comment = create_comment(
        db_session,
        transcript,
        start_token_id=tokens[0].id,
        end_token_id=tokens[1].id,
        text="Discussing the climate crisis",
        user_id=user.id,
    )

    # "climates" stems to the same root as "climate".
    hits = search_project(db_session, project.id, "climates")

    comment_hits = [hit for hit in hits if hit.kind == "comment"]
    assert len(comment_hits) == 1
    assert comment_hits[0].id == comment.id
    assert comment_hits[0].start_time == tokens[0].start_time


def test_search_is_project_scoped(db_session: Session, user: User) -> None:
    project_a = _project(db_session, user)
    project_b = _project(db_session, user)
    _transcript(db_session, project_a, user, "a")
    _transcript(db_session, project_b, user, "b")

    hits = search_project(db_session, project_a.id, "hello")

    assert all(hit.video_id is not None for hit in hits)
    assert len([hit for hit in hits if hit.kind == "transcript"]) == 1


def _add_matching_tokens(
    db: Session,
    transcript: Transcript,
    segment_id: uuid.UUID,
    project: Project,
    user: User,
    count: int,
    text: str = "matchword",
    start: float = 0.0,
) -> None:
    for i in range(count):
        db.add(
            TranscriptToken(
                transcript_id=transcript.id,
                segment_id=segment_id,
                project_id=project.id,
                original_text=text,
                edited_text=None,
                start_time=start + i,
                end_time=start + i + 0.5,
                position=Decimal(i + 100),
                created_by=user.id,
                updated_by=user.id,
            )
        )
    db.flush()


def test_group_search_hits_groups_by_video(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    _transcript(db_session, project, user, "clip-a")
    _transcript(db_session, project, user, "clip-b")

    result = group_search_hits(db_session, project.id, "hello", limit=10, offset=0)

    assert result.total_videos == 2
    assert len(result.groups) == 2
    assert {g.video_name for g in result.groups} == {"clip-a", "clip-b"}
    assert all(g.hit_count == 1 for g in result.groups)


def test_group_search_hits_sorts_hits_by_start_time_with_speaker_last(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript)
    segment_id = tokens[0].segment_id
    # Two more matching tokens, out of chronological order, plus a speaker hit.
    _add_matching_tokens(db_session, transcript, segment_id, project, user, 1, "echo", start=50.0)
    _add_matching_tokens(db_session, transcript, segment_id, project, user, 1, "echo", start=10.0)
    db_session.add(
        Speaker(
            video_id=transcript.video_id,
            project_id=project.id,
            provider_identifier="speaker_echo",
            name="Echo",
        )
    )
    db_session.flush()

    result = group_search_hits(db_session, project.id, "echo", limit=10, offset=0)

    assert len(result.groups) == 1
    start_times = [hit.start_time for hit in result.groups[0].hits]
    assert start_times == [10.0, 50.0, None]


def test_group_search_hits_caps_per_video_and_reports_true_count(
    db_session: Session, user: User
) -> None:
    project = _project(db_session, user)
    transcript = _transcript(db_session, project, user, "clip")
    tokens = _tokens(db_session, transcript)
    segment_id = tokens[0].segment_id
    _add_matching_tokens(
        db_session, transcript, segment_id, project, user, MAX_HITS_PER_VIDEO + 5, "matchword"
    )

    result = group_search_hits(db_session, project.id, "matchword", limit=10, offset=0)

    assert len(result.groups) == 1
    group = result.groups[0]
    assert group.hit_count == MAX_HITS_PER_VIDEO + 5
    assert len(group.hits) == MAX_HITS_PER_VIDEO


def test_group_search_hits_ranks_by_best_hit_and_paginates(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    # More repeated matches -> higher ts_rank for that video's best hit.
    strong = _transcript(db_session, project, user, "strong")
    strong_segment = _tokens(db_session, strong)[0].segment_id
    _add_matching_tokens(db_session, strong, strong_segment, project, user, 5, "unique")
    weak = _transcript(db_session, project, user, "weak")
    weak_segment = _tokens(db_session, weak)[0].segment_id
    _add_matching_tokens(db_session, weak, weak_segment, project, user, 1, "unique")

    first_page = group_search_hits(db_session, project.id, "unique", limit=1, offset=0)
    second_page = group_search_hits(db_session, project.id, "unique", limit=1, offset=1)

    assert first_page.total_videos == 2
    assert len(first_page.groups) == 1
    assert first_page.groups[0].video_name == "strong"
    assert second_page.total_videos == 2
    assert len(second_page.groups) == 1
    assert second_page.groups[0].video_name == "weak"


def test_group_search_hits_includes_folder_breadcrumb(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    root = Folder(project_id=project.id, name="Root", created_by=user.id, updated_by=user.id)
    db_session.add(root)
    db_session.flush()
    child = Folder(
        project_id=project.id,
        parent_folder_id=root.id,
        name="Child",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(child)
    db_session.flush()
    video = Video(
        folder_id=child.id,
        project_id=project.id,
        name="nested-clip",
        original_filename="nested-clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()
    raw = load_deepgram_sample()
    create_transcript_from_normalized(db_session, video, normalize(raw), raw, created_by=user.id)
    db_session.flush()

    result = group_search_hits(db_session, project.id, "hello", limit=10, offset=0)

    assert len(result.groups) == 1
    assert result.groups[0].folder_path == ["Root", "Child"]


def test_group_search_hits_thumbnail_flag(db_session: Session, user: User) -> None:
    project = _project(db_session, user)
    with_thumb = _transcript(db_session, project, user, "with-thumb")
    without_thumb = _transcript(db_session, project, user, "without-thumb")
    db_session.add(
        VideoAsset(
            video_id=with_thumb.video_id,
            type=AssetType.THUMBNAIL,
            storage_path=f"videos/{with_thumb.video_id}/thumbnail.jpg",
            mime_type="image/jpeg",
        )
    )
    db_session.flush()

    result = group_search_hits(db_session, project.id, "hello", limit=10, offset=0)

    by_video = {g.video_id: g.has_thumbnail for g in result.groups}
    assert by_video[with_thumb.video_id] is True
    assert by_video[without_thumb.video_id] is False
