import uuid
from datetime import datetime
from decimal import Decimal

from app.models.asset import AssetType, VideoAsset
from app.models.chat import ChatConversation, ChatMessage
from app.models.embedding import EMBEDDING_DIMENSION, TranscriptChunk
from app.models.folder import Folder
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import (
    Transcript,
    TranscriptSegment,
    TranscriptToken,
    TranscriptType,
)
from app.models.user import User
from app.models.video import Video
from sqlalchemy.orm import Session


def test_user_timestamps_populate_on_flush(db_session: Session) -> None:
    user = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com")
    db_session.add(user)
    db_session.flush()

    assert isinstance(user.created_at, datetime)
    assert isinstance(user.updated_at, datetime)
    assert user.display_name is None


def test_project_defaults(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    assert isinstance(project.id, uuid.UUID)
    assert isinstance(project.created_at, datetime)
    assert project.archived_at is None
    assert project.description is None


def test_project_membership_links_user_and_project(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    membership = ProjectMembership(
        project_id=project.id, user_id=user.id, role=MembershipRole.OWNER
    )
    db_session.add(membership)
    db_session.flush()

    assert membership.project_id == project.id
    assert membership.user_id == user.id
    assert membership.role is MembershipRole.OWNER
    assert isinstance(membership.created_at, datetime)


def test_folder_self_nesting(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    parent = Folder(project_id=project.id, name="Parent", created_by=user.id, updated_by=user.id)
    db_session.add(parent)
    db_session.flush()

    child = Folder(
        project_id=project.id,
        parent_folder_id=parent.id,
        name="Child",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(child)
    db_session.flush()

    assert parent.parent_folder_id is None
    assert child.parent_folder_id == parent.id


def test_video_and_asset_enum(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()

    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="Clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()

    asset = VideoAsset(
        video_id=video.id,
        type=AssetType.ORIGINAL,
        storage_path="videos/clip/original.mp4",
    )
    db_session.add(asset)
    db_session.flush()
    db_session.refresh(asset)

    assert asset.type is AssetType.ORIGINAL
    assert video.duration is None


def _make_video(db_session: Session, user: User) -> Video:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db_session.add(folder)
    db_session.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="Clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(video)
    db_session.flush()
    return video


def test_transcript_speaker_segment_token(db_session: Session, user: User) -> None:
    video = _make_video(db_session, user)

    speaker = Speaker(
        video_id=video.id, project_id=video.project_id, provider_identifier="speaker_0"
    )
    db_session.add(speaker)
    db_session.flush()

    transcript = Transcript(
        video_id=video.id,
        project_id=video.project_id,
        language="en",
        type=TranscriptType.ORIGINAL,
        created_by=user.id,
    )
    db_session.add(transcript)
    db_session.flush()

    segment = TranscriptSegment(
        transcript_id=transcript.id, speaker_id=speaker.id, position=Decimal(1)
    )
    db_session.add(segment)
    db_session.flush()

    token = TranscriptToken(
        transcript_id=transcript.id,
        segment_id=segment.id,
        project_id=video.project_id,
        original_text="Hello",
        start_time=0.0,
        end_time=0.4,
        position=Decimal(1),
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(token)
    db_session.flush()
    db_session.refresh(token)

    assert transcript.type is TranscriptType.ORIGINAL
    assert transcript.provider_raw_response is None
    assert speaker.name is None
    assert segment.speaker_id == speaker.id
    assert token.edited_text is None
    assert token.is_deleted is False


def _make_transcript_with_token(
    db_session: Session, user: User
) -> tuple[Video, Transcript, TranscriptSegment, TranscriptToken]:
    video = _make_video(db_session, user)
    transcript = Transcript(
        video_id=video.id,
        project_id=video.project_id,
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
        project_id=video.project_id,
        original_text="Hello",
        start_time=0.0,
        end_time=0.4,
        position=Decimal(1),
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(token)
    db_session.flush()
    return video, transcript, segment, token


def test_transcript_chunk_defaults(db_session: Session, user: User) -> None:
    video, transcript, segment, token = _make_transcript_with_token(db_session, user)

    chunk = TranscriptChunk(
        transcript_id=transcript.id,
        video_id=video.id,
        project_id=video.project_id,
        language=transcript.language,
        segment_id=segment.id,
        start_token_id=token.id,
        end_token_id=token.id,
        start_time=token.start_time,
        end_time=token.end_time,
        speaker_name=None,
        chunk_index=0,
        text="Hello",
        search_vector="'hello':1",
        embedding=[0.0] * EMBEDDING_DIMENSION,
        embedding_model="openai/text-embedding-3-small",
    )
    db_session.add(chunk)
    db_session.flush()
    db_session.refresh(chunk)

    assert chunk.transcript_id == transcript.id
    assert chunk.project_id == video.project_id
    assert len(chunk.embedding) == EMBEDDING_DIMENSION
    assert chunk.chunk_index == 0
    assert isinstance(chunk.created_at, datetime)


def test_chat_conversation_and_message(db_session: Session, user: User) -> None:
    project = Project(name="Doc", created_by=user.id, updated_by=user.id)
    db_session.add(project)
    db_session.flush()

    conversation = ChatConversation(project_id=project.id, created_by=user.id, updated_by=user.id)
    db_session.add(conversation)
    db_session.flush()

    user_message = ChatMessage(
        conversation_id=conversation.id,
        project_id=project.id,
        role="user",
        content="Is there dialogue about the church?",
        created_by=user.id,
    )
    db_session.add(user_message)
    db_session.flush()

    assistant_message = ChatMessage(
        conversation_id=conversation.id,
        project_id=project.id,
        role="assistant",
        content="Yes, in [1] a character mentions the church.",
        citations=[{"marker": 1, "chunk_id": str(uuid.uuid4())}],
        created_by=user.id,
    )
    db_session.add(assistant_message)
    db_session.flush()
    db_session.refresh(assistant_message)

    assert conversation.title is None
    assert conversation.agent_message_history is None
    assert user_message.citations is None
    assert assistant_message.citations is not None
    assert assistant_message.citations[0]["marker"] == 1


def test_processing_job_defaults(db_session: Session) -> None:
    job = ProcessingJob(type=JobType.NOOP)
    db_session.add(job)
    db_session.flush()
    db_session.refresh(job)

    assert job.status is JobStatus.PENDING
    assert job.progress == 0
    assert job.video_id is None
    assert job.project_id is None
    assert job.result is None
    assert job.started_at is None
    assert isinstance(job.created_at, datetime)
