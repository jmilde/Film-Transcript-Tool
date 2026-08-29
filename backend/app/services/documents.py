"""Document CRUD and clip-block resolution.

A ``Document`` mixes user prose with embedded clip-block nodes (structured
references to a transcript token range). Nothing about a clip's display —
excerpt, timecodes, speaker, thumbnail, breadcrumb — is ever persisted on
``Document.content``; it is resolved fresh from the referenced tokens on every
read, exactly like ``ChatCitation`` (``app/api/routes/chat.py``) and
``SearchGroup`` (``app/services/search.py``). Document CRUD is synchronous,
like Comments — not async like Exports.

Whole-document optimistic locking mirrors ``TranscriptToken.version``
(``app/services/tokens.py``): every write re-reads the row with ``FOR UPDATE``
inside the same transaction and rejects a stale ``expected_version`` with
``ConflictError`` before mutating anything.
"""

import copy
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.media_token import mint_media_token
from app.models.asset import AssetType, VideoAsset
from app.models.document import Document
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.video import Video
from app.schemas.document import ClipBlockRead
from app.services.folders import build_folder_breadcrumbs


class ClipBlockRangeInvalidError(BadRequestError):
    """Raised when a clip block's start/end tokens don't both belong to the transcript."""

    code = "CLIP_BLOCK_RANGE_INVALID"


class DocumentContentInvalidError(BadRequestError):
    """Raised when a clip block's transcript doesn't belong to the document's own project.

    Documents are project-scoped; without this check a member of one project
    could craft a clip block naming another project's transcript id and read
    its excerpt/video name back through this document, bypassing membership
    checks on that other project entirely.
    """

    code = "DOCUMENT_CONTENT_INVALID"


def create_document(
    session: Session, project_id: uuid.UUID, user_id: uuid.UUID, title: str
) -> Document:
    document = Document(
        project_id=project_id,
        title=title,
        content={"type": "doc", "content": []},
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(document)
    session.flush()
    return document


def list_documents(session: Session, project_id: uuid.UUID) -> list[Document]:
    return list(
        session.execute(
            select(Document)
            .where(Document.project_id == project_id)
            .order_by(Document.updated_at.desc())
        )
        .scalars()
        .all()
    )


def _validate_content_scope(
    session: Session, project_id: uuid.UUID, content: dict[str, Any]
) -> None:
    """Reject content whose clip blocks reference a transcript outside ``project_id``.

    Without this, a member of one project could write a clip block naming
    another project's transcript id and have this document's ``GET`` resolve
    and return that transcript's excerpt/video name — a cross-project data
    leak that bypasses the other project's own membership check entirely.
    """
    transcript_ids = {
        uuid.UUID(node["attrs"]["transcriptId"]) for node in _iter_clip_nodes(content)
    }
    if not transcript_ids:
        return
    in_scope = set(
        session.execute(
            select(Transcript.id).where(
                Transcript.id.in_(transcript_ids), Transcript.project_id == project_id
            )
        ).scalars()
    )
    if in_scope != transcript_ids:
        raise DocumentContentInvalidError(
            "A clip block references a transcript outside this document's project"
        )


def update_document(
    session: Session,
    document: Document,
    *,
    user_id: uuid.UUID,
    title: str | None,
    content: dict[str, Any] | None,
    expected_version: int,
) -> Document:
    locked = session.execute(
        select(Document).where(Document.id == document.id).with_for_update()
    ).scalar_one()
    if locked.version != expected_version:
        raise ConflictError(
            "This document was edited by someone else",
            details={"current_version": locked.version},
        )
    if title is not None:
        locked.title = title
    if content is not None:
        _validate_content_scope(session, locked.project_id, content)
        locked.content = content
    locked.updated_by = user_id
    locked.version += 1
    session.flush()
    return locked


def delete_document(session: Session, document: Document) -> None:
    session.delete(document)
    session.flush()


def _range_tokens(
    session: Session,
    transcript_id: uuid.UUID,
    start_token: TranscriptToken,
    end_token: TranscriptToken,
) -> list[TranscriptToken]:
    """All non-deleted tokens from ``start_token`` to ``end_token``, transcript order.

    Transcript order is ``(segment.position, token.position)`` — the same order
    the frontend's flattened token list uses, so a range can span segments
    (a drag-selection isn't confined to one speaker turn).
    """
    start_segment = session.get(TranscriptSegment, start_token.segment_id)
    end_segment = session.get(TranscriptSegment, end_token.segment_id)
    assert start_segment is not None and end_segment is not None
    rows = session.execute(
        select(TranscriptToken)
        .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
        .where(
            TranscriptToken.transcript_id == transcript_id,
            TranscriptToken.is_deleted.is_(False),
            tuple_(TranscriptSegment.position, TranscriptToken.position)
            >= (start_segment.position, start_token.position),
            tuple_(TranscriptSegment.position, TranscriptToken.position)
            <= (end_segment.position, end_token.position),
        )
        .order_by(TranscriptSegment.position, TranscriptToken.position)
    ).scalars()
    return list(rows)


def _excerpt(tokens: list[TranscriptToken]) -> str:
    return " ".join(token.edited_text or token.original_text for token in tokens)


def resolve_clip_block(
    session: Session,
    *,
    project_id: uuid.UUID,
    transcript_id: uuid.UUID,
    start_token_id: uuid.UUID,
    end_token_id: uuid.UUID,
) -> ClipBlockRead:
    """Resolve one clip block's display fields, reusing the token-range lookup
    pattern from ``services/comments.py``'s comment-range resolution.

    ``project_id`` scopes the lookup to the calling document's own project —
    see ``_validate_content_scope`` for why this boundary matters.
    """
    transcript = session.get(Transcript, transcript_id)
    if transcript is None or transcript.project_id != project_id:
        raise NotFoundError("Transcript not found")

    tokens = {
        token.id: token
        for token in session.execute(
            select(TranscriptToken).where(TranscriptToken.id.in_({start_token_id, end_token_id}))
        )
        .scalars()
        .all()
    }
    start_token = tokens.get(start_token_id)
    end_token = tokens.get(end_token_id)
    if start_token is None or end_token is None:
        raise NotFoundError("Token not found")
    if start_token.transcript_id != transcript_id or end_token.transcript_id != transcript_id:
        raise ClipBlockRangeInvalidError("Token does not belong to this transcript")

    excerpt = _excerpt(_range_tokens(session, transcript_id, start_token, end_token))

    start_segment = session.get(TranscriptSegment, start_token.segment_id)
    assert start_segment is not None
    speaker = (
        session.get(Speaker, start_segment.speaker_id)
        if start_segment.speaker_id is not None
        else None
    )
    video = session.get(Video, transcript.video_id)
    assert video is not None
    has_thumbnail = (
        session.execute(
            select(VideoAsset.id).where(
                VideoAsset.video_id == video.id, VideoAsset.type == AssetType.THUMBNAIL
            )
        ).first()
        is not None
    )
    folder_path = build_folder_breadcrumbs(session, [video.folder_id]).get(video.folder_id, [])

    return ClipBlockRead(
        transcript_id=transcript_id,
        video_id=video.id,
        video_name=video.name,
        segment_id=start_token.segment_id,
        start_token_id=start_token_id,
        end_token_id=end_token_id,
        start_time=start_token.start_time,
        end_time=end_token.end_time,
        speaker_name=speaker.name if speaker is not None else None,
        language=transcript.language,
        excerpt=excerpt,
        thumbnail_token=mint_media_token(video.id) if has_thumbnail else None,
        folder_path=folder_path,
    )


def _iter_clip_nodes(node: dict[str, Any]) -> list[dict[str, Any]]:
    found = [node] if node.get("type") == "clipBlock" else []
    for child in node.get("content") or []:
        found.extend(_iter_clip_nodes(child))
    return found


def _find_clip_node(content: dict[str, Any], node_id: str) -> dict[str, Any] | None:
    for node in _iter_clip_nodes(content):
        if (node.get("attrs") or {}).get("nodeId") == node_id:
            return node
    return None


def _iter_comment_marked_text(node: dict[str, Any], comment_id: str) -> list[str]:
    """Text runs carrying a `comment` mark with the given `commentId`.

    A comment's prose-text anchor is the TipTap `comment` mark, not a
    relational column — see `DocumentCommentAnchor`. A single comment can span
    several adjacent text nodes (e.g. selection crossing a bold/plain
    boundary), so this collects and joins every run rather than assuming one.
    """
    found = []
    if node.get("type") == "text":
        marks = node.get("marks") or []
        if any(
            mark.get("type") == "comment"
            and (mark.get("attrs") or {}).get("commentId") == comment_id
            for mark in marks
        ):
            found.append(node.get("text") or "")
    for child in node.get("content") or []:
        found.extend(_iter_comment_marked_text(child, comment_id))
    return found


def resolve_document_comment_excerpt(
    session: Session,
    document: Document,
    *,
    comment_id: uuid.UUID,
    clip_node_id: str | None,
) -> str | None:
    """Resolve a document-anchored comment's excerpt fresh from current content.

    Mirrors `resolve_document_content`'s on-read resolution for clip blocks:
    nothing is persisted, so this always reflects the document's current
    state, returning `None` if the anchor (clip node or comment mark) can no
    longer be found — e.g. the clip was later removed from the document.
    """
    if clip_node_id is not None:
        node = _find_clip_node(document.content, clip_node_id)
        if node is None:
            return None
        attrs = node.get("attrs") or {}
        transcript_id = uuid.UUID(attrs["transcriptId"])
        start_token_id = uuid.UUID(attrs["startTokenId"])
        end_token_id = uuid.UUID(attrs["endTokenId"])
        tokens = {
            token.id: token
            for token in session.execute(
                select(TranscriptToken).where(
                    TranscriptToken.id.in_({start_token_id, end_token_id})
                )
            )
            .scalars()
            .all()
        }
        start_token = tokens.get(start_token_id)
        end_token = tokens.get(end_token_id)
        if start_token is None or end_token is None:
            return None
        return _excerpt(_range_tokens(session, transcript_id, start_token, end_token))

    text_runs = _iter_comment_marked_text(document.content, str(comment_id))
    return "".join(text_runs) if text_runs else None


def _map_clip_nodes(
    node: dict[str, Any], resolve: Callable[[dict[str, Any]], dict[str, Any]]
) -> None:
    if node.get("type") == "clipBlock":
        node["attrs"] = resolve(node.get("attrs") or {})
    for child in node.get("content") or []:
        _map_clip_nodes(child, resolve)


def resolve_document_content(session: Session, document: Document) -> dict[str, Any]:
    """Batch-resolve every clipBlock node in ``document.content``.

    Returns an augmented **copy**; the resolved fields are never persisted.
    Batches per referenced transcript (one ordered-token query, one lookup per
    video/speaker/breadcrumb set) rather than per node, so a multi-clip
    document costs a handful of queries, not one per clip.
    """
    resolved_content = copy.deepcopy(document.content)
    clip_nodes = _iter_clip_nodes(resolved_content)
    if not clip_nodes:
        return resolved_content

    transcript_ids = {uuid.UUID(node["attrs"]["transcriptId"]) for node in clip_nodes}
    token_ids = {
        uuid.UUID(node["attrs"][key])
        for node in clip_nodes
        for key in ("startTokenId", "endTokenId")
    }

    transcripts = {
        transcript.id: transcript
        for transcript in session.execute(
            select(Transcript).where(Transcript.id.in_(transcript_ids))
        ).scalars()
    }
    tokens = {
        token.id: token
        for token in session.execute(
            select(TranscriptToken).where(TranscriptToken.id.in_(token_ids))
        ).scalars()
    }

    # One ordered token list per transcript; every node's range is a slice of
    # it, so this is one query per transcript rather than one per clip.
    #
    # Includes deleted tokens (unlike resolve_clip_block's per-node query),
    # so a clip whose boundary token was later soft-deleted or replaced by a
    # merge/split still has a valid index to slice from instead of raising
    # KeyError on read. Deleted tokens are filtered out only when building
    # the excerpt text itself (see `resolve` below).
    ordered_tokens_by_transcript: dict[uuid.UUID, list[TranscriptToken]] = {}
    for transcript_id in transcript_ids:
        ordered_tokens_by_transcript[transcript_id] = list(
            session.execute(
                select(TranscriptToken)
                .join(TranscriptSegment, TranscriptSegment.id == TranscriptToken.segment_id)
                .where(TranscriptToken.transcript_id == transcript_id)
                .order_by(TranscriptSegment.position, TranscriptToken.position)
            ).scalars()
        )
    token_position: dict[uuid.UUID, int] = {
        token.id: index
        for ordered in ordered_tokens_by_transcript.values()
        for index, token in enumerate(ordered)
    }

    segment_ids = {token.segment_id for token in tokens.values()}
    segments = {
        segment.id: segment
        for segment in session.execute(
            select(TranscriptSegment).where(TranscriptSegment.id.in_(segment_ids))
        ).scalars()
    }
    speaker_ids = {
        segment.speaker_id for segment in segments.values() if segment.speaker_id is not None
    }
    speakers = {
        speaker.id: speaker
        for speaker in session.execute(select(Speaker).where(Speaker.id.in_(speaker_ids))).scalars()
    }

    video_ids = {transcript.video_id for transcript in transcripts.values()}
    videos = {
        video.id: video
        for video in session.execute(select(Video).where(Video.id.in_(video_ids))).scalars()
    }
    thumbnail_video_ids = set(
        session.execute(
            select(VideoAsset.video_id).where(
                VideoAsset.video_id.in_(video_ids), VideoAsset.type == AssetType.THUMBNAIL
            )
        ).scalars()
    )
    breadcrumbs = build_folder_breadcrumbs(session, (video.folder_id for video in videos.values()))

    def resolve(attrs: dict[str, Any]) -> dict[str, Any]:
        transcript_id = uuid.UUID(attrs["transcriptId"])
        start_token = tokens[uuid.UUID(attrs["startTokenId"])]
        end_token = tokens[uuid.UUID(attrs["endTokenId"])]
        ordered = ordered_tokens_by_transcript[transcript_id]
        start_index = token_position[start_token.id]
        end_index = token_position[end_token.id]
        excerpt = _excerpt(
            [token for token in ordered[start_index : end_index + 1] if not token.is_deleted]
        )
        transcript = transcripts[transcript_id]
        video = videos[transcript.video_id]
        start_segment = segments[start_token.segment_id]
        speaker = (
            speakers.get(start_segment.speaker_id) if start_segment.speaker_id is not None else None
        )
        return {
            **attrs,
            "video_id": str(video.id),
            "video_name": video.name,
            "segment_id": str(start_token.segment_id),
            "start_time": start_token.start_time,
            "end_time": end_token.end_time,
            "speaker_name": speaker.name if speaker is not None else None,
            "language": transcript.language,
            "excerpt": excerpt,
            "thumbnail_token": (
                mint_media_token(video.id) if video.id in thumbnail_video_ids else None
            ),
            "folder_path": breadcrumbs.get(video.folder_id, []),
        }

    _map_clip_nodes(resolved_content, resolve)
    return resolved_content
