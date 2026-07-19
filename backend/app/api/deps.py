import uuid
from dataclasses import dataclass

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.models.comment import Comment
from app.models.folder import Folder
from app.models.job import ProcessingJob
from app.models.membership import ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.schemas.token import TokenMergeRequest
from app.storage.base import Storage
from app.storage.factory import get_local_storage


def get_storage() -> Storage:
    return get_local_storage()


def _require_membership(db: Session, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    membership = db.execute(
        select(ProjectMembership.id).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise ForbiddenError("You are not a member of this project")


def require_project_member(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")
    _require_membership(db, project.id, user.id)
    return project


def require_folder_access(
    folder_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise NotFoundError("Folder not found")
    _require_membership(db, folder.project_id, user.id)
    return folder


def require_video_access(
    video_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Video:
    video = db.get(Video, video_id)
    if video is None:
        raise NotFoundError("Video not found")
    _require_membership(db, video.project_id, user.id)
    return video


def require_job_access(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None or job.project_id is None:
        raise NotFoundError("Job not found")
    _require_membership(db, job.project_id, user.id)
    return job


def require_transcript_access(
    transcript_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transcript:
    transcript = db.get(Transcript, transcript_id)
    if transcript is None:
        raise NotFoundError("Transcript not found")
    _require_membership(db, transcript.project_id, user.id)
    return transcript


def require_speaker_access(
    speaker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Speaker:
    speaker = db.get(Speaker, speaker_id)
    if speaker is None:
        raise NotFoundError("Speaker not found")
    _require_membership(db, speaker.project_id, user.id)
    return speaker


def require_token_access(
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TranscriptToken:
    token = db.get(TranscriptToken, token_id)
    if token is None:
        raise NotFoundError("Token not found")
    _require_membership(db, token.project_id, user.id)
    return token


def require_comment_access(
    comment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise NotFoundError("Comment not found")
    _require_membership(db, comment.project_id, user.id)
    return comment


@dataclass
class MergeContext:
    """Resolved, authorized inputs for a token merge."""

    tokens: list[TranscriptToken]
    text: str


def require_merge_context(
    payload: TokenMergeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MergeContext:
    """Load and authorize the tokens named in a merge request.

    This is the sole consumer of the request body so the route keeps a single
    body parameter. Every token must exist and share one project (they must be
    in the same segment to merge anyway), which the caller must be a member of.
    """
    tokens = list(
        db.execute(select(TranscriptToken).where(TranscriptToken.id.in_(payload.token_ids)))
        .scalars()
        .all()
    )
    found = {token.id for token in tokens}
    if any(token_id not in found for token_id in payload.token_ids):
        raise NotFoundError("Token not found")
    project_ids = {token.project_id for token in tokens}
    if len(project_ids) != 1:
        raise ForbiddenError("Tokens belong to different projects")
    _require_membership(db, next(iter(project_ids)), user.id)
    return MergeContext(tokens=tokens, text=payload.text)
