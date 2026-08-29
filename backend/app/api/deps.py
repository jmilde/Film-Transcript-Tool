import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import ForbiddenError, NotFoundError
from app.core.media_token import verify_media_token
from app.db.session import get_db
from app.models.comment import Comment
from app.models.export import Export
from app.models.folder import Folder
from app.models.job import ProcessingJob
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptToken
from app.models.user import User
from app.models.video import Video
from app.schemas.token import TokenMergeRequest
from app.storage.base import Storage
from app.storage.factory import get_local_storage

_ROLE_RANK: dict[MembershipRole, int] = {
    MembershipRole.VIEWER: 0,
    MembershipRole.EDITOR: 1,
    MembershipRole.OWNER: 2,
}


def get_storage() -> Storage:
    return get_local_storage()


def _require_membership(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    min_role: MembershipRole = MembershipRole.VIEWER,
) -> ProjectMembership:
    membership = db.execute(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise ForbiddenError("You are not a member of this project")
    if _ROLE_RANK[membership.role] < _ROLE_RANK[min_role]:
        raise ForbiddenError(f"This action requires the '{min_role.value}' role or higher")
    return membership


class _ProjectScoped(Protocol):
    project_id: uuid.UUID


def require_min_role[T: _ProjectScoped](
    accessor: Callable[..., T],
    min_role: MembershipRole,
) -> Callable[..., T]:
    """Wrap a ``require_*_access`` dependency with an additional role floor.

    ``accessor`` already fetches the row and enforces plain (``VIEWER``-level)
    membership; this layers an ``EDITOR``/``OWNER`` floor on top for the write
    routes that need it, without touching ``accessor``'s own call sites (which
    stay at the ``VIEWER`` default, e.g. the matching GET routes).
    """

    def dependency(
        obj: T = Depends(accessor),
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> T:
        _require_membership(db, obj.project_id, user.id, min_role=min_role)
        return obj

    return dependency


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


def require_project_editor(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """``require_project_member`` plus an ``EDITOR`` floor.

    ``Project`` has no ``project_id`` column (it *is* the project), so it
    can't use the generic ``require_min_role`` wrapper; this is its one-off
    equivalent.
    """
    _require_membership(db, project.id, user.id, min_role=MembershipRole.EDITOR)
    return project


def require_project_owner(
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """``require_project_member`` plus an ``OWNER`` floor (membership management)."""
    _require_membership(db, project.id, user.id, min_role=MembershipRole.OWNER)
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


def require_video_media_access(
    video_id: uuid.UUID,
    token: str,
    db: Session = Depends(get_db),
) -> Video:
    """Authorize a media (proxy/stream) request via a signed ``?token=``.

    Used by routes that a browser reaches through ``<video src>``/``<img src>``,
    which cannot send an ``Authorization`` header. A valid token was only ever
    minted for a project member, so it stands in for the membership check.
    """
    verify_media_token(token, video_id)
    video = db.get(Video, video_id)
    if video is None:
        raise NotFoundError("Video not found")
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
    # Every current caller is a write route (rename); EDITOR floor applies
    # unconditionally rather than through the `require_min_role` wrapper.
    speaker = db.get(Speaker, speaker_id)
    if speaker is None:
        raise NotFoundError("Speaker not found")
    _require_membership(db, speaker.project_id, user.id, min_role=MembershipRole.EDITOR)
    return speaker


def require_token_access(
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TranscriptToken:
    # Every current caller is a write route (edit/delete/split); EDITOR floor
    # applies unconditionally rather than through the `require_min_role` wrapper.
    token = db.get(TranscriptToken, token_id)
    if token is None:
        raise NotFoundError("Token not found")
    _require_membership(db, token.project_id, user.id, min_role=MembershipRole.EDITOR)
    return token


def require_comment_access(
    comment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Comment:
    # Every current caller is a write route (reply/resolve); EDITOR floor
    # applies unconditionally rather than through the `require_min_role` wrapper.
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise NotFoundError("Comment not found")
    _require_membership(db, comment.project_id, user.id, min_role=MembershipRole.EDITOR)
    return comment


def require_export_access(
    export_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Export:
    export = db.get(Export, export_id)
    if export is None:
        raise NotFoundError("Export not found")
    _require_membership(db, export.project_id, user.id)
    return export


@dataclass
class MergeContext:
    """Resolved, authorized inputs for a token merge."""

    tokens: list[TranscriptToken]
    text: str
    expected_versions: dict[uuid.UUID, int]


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
    token_ids = [item.token_id for item in payload.tokens]
    tokens = list(
        db.execute(select(TranscriptToken).where(TranscriptToken.id.in_(token_ids))).scalars().all()
    )
    found = {token.id for token in tokens}
    if any(token_id not in found for token_id in token_ids):
        raise NotFoundError("Token not found")
    project_ids = {token.project_id for token in tokens}
    if len(project_ids) != 1:
        raise ForbiddenError("Tokens belong to different projects")
    _require_membership(db, next(iter(project_ids)), user.id, min_role=MembershipRole.EDITOR)
    expected_versions = {item.token_id: item.expected_version for item in payload.tokens}
    return MergeContext(tokens=tokens, text=payload.text, expected_versions=expected_versions)
