import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.asset import AssetType, VideoAsset
from app.models.comment import Comment, CommentRange
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptToken
from app.models.video import Video
from app.services.folders import build_folder_breadcrumbs

# Hits shown per video group; the rest are still counted in ``hit_count``.
MAX_HITS_PER_VIDEO = 20


@dataclass
class SearchHit:
    """A single project-search match, from any of the three sources."""

    kind: str
    id: uuid.UUID
    video_id: uuid.UUID
    transcript_id: uuid.UUID | None
    text: str
    start_time: float | None
    rank: float


def search_project(session: Session, project_id: uuid.UUID, query: str) -> list[SearchHit]:
    """Full-text search a project's transcript text, speakers, and comments.

    Each source is queried against its stored ``tsvector`` (English config, so
    matching is stemmed) and the results are merged and ranked together with
    ``ts_rank``. Authorization is the caller's responsibility — ``project_id``
    already scopes every query.
    """
    tsquery = func.plainto_tsquery("english", query)
    hits: list[SearchHit] = []

    # Transcript text — one hit per matching non-deleted token, seekable via
    # its start time. Deleted tokens stay indexed but are excluded here.
    token_rows = session.execute(
        select(
            TranscriptToken.id,
            Transcript.video_id,
            TranscriptToken.transcript_id,
            func.coalesce(TranscriptToken.edited_text, TranscriptToken.original_text),
            TranscriptToken.start_time,
            func.ts_rank(TranscriptToken.search_vector, tsquery),
        )
        .join(Transcript, Transcript.id == TranscriptToken.transcript_id)
        .where(
            TranscriptToken.project_id == project_id,
            TranscriptToken.is_deleted.is_(False),
            TranscriptToken.search_vector.op("@@")(tsquery),
        )
    ).all()
    hits.extend(
        SearchHit(
            kind="transcript",
            id=row[0],
            video_id=row[1],
            transcript_id=row[2],
            text=row[3],
            start_time=row[4],
            rank=float(row[5]),
        )
        for row in token_rows
    )

    # Speaker names — video-level, so no timecode to seek to.
    speaker_rows = session.execute(
        select(
            Speaker.id,
            Speaker.video_id,
            Speaker.name,
            func.ts_rank(Speaker.search_vector, tsquery),
        ).where(
            Speaker.project_id == project_id,
            Speaker.search_vector.op("@@")(tsquery),
        )
    ).all()
    hits.extend(
        SearchHit(
            kind="speaker",
            id=row[0],
            video_id=row[1],
            transcript_id=None,
            text=row[2] or "",
            start_time=None,
            rank=float(row[3]),
        )
        for row in speaker_rows
    )

    # Comments — seekable via the range's start token.
    comment_rows = session.execute(
        select(
            Comment.id,
            Transcript.video_id,
            Comment.transcript_id,
            Comment.text,
            TranscriptToken.start_time,
            func.ts_rank(Comment.search_vector, tsquery),
        )
        .join(Transcript, Transcript.id == Comment.transcript_id)
        .join(CommentRange, CommentRange.comment_id == Comment.id)
        .join(TranscriptToken, TranscriptToken.id == CommentRange.start_token_id)
        .where(
            Comment.project_id == project_id,
            Comment.search_vector.op("@@")(tsquery),
        )
    ).all()
    hits.extend(
        SearchHit(
            kind="comment",
            id=row[0],
            video_id=row[1],
            transcript_id=row[2],
            text=row[3],
            start_time=row[4],
            rank=float(row[5]),
        )
        for row in comment_rows
    )

    hits.sort(key=lambda hit: hit.rank, reverse=True)
    return hits


@dataclass
class SearchGroup:
    """All matches within one video, plus the context needed to render a card."""

    video_id: uuid.UUID
    video_name: str
    folder_path: list[str]
    has_thumbnail: bool
    hits: list[SearchHit]
    hit_count: int


@dataclass
class PaginatedSearchGroups:
    groups: list[SearchGroup]
    total_videos: int


def _hit_sort_key(hit: SearchHit) -> tuple[int, float]:
    # Speaker hits have no start_time; sort them after every seekable hit.
    return (0, hit.start_time) if hit.start_time is not None else (1, 0.0)


def group_search_hits(
    session: Session, project_id: uuid.UUID, query: str, *, limit: int, offset: int
) -> PaginatedSearchGroups:
    """Group ``search_project``'s flat hits by video, ranked and paginated.

    Groups are ranked by their best hit's rank descending, then paginated as a
    list (``limit``/``offset`` apply to videos, not individual hits). Within a
    group, hits are sorted by ``start_time`` ascending and capped at
    ``MAX_HITS_PER_VIDEO``, with ``hit_count`` tracking the true total.
    """
    hits = search_project(session, project_id, query)

    by_video: dict[uuid.UUID, list[SearchHit]] = {}
    for hit in hits:
        by_video.setdefault(hit.video_id, []).append(hit)

    ranked_video_ids = sorted(
        by_video, key=lambda vid: max(h.rank for h in by_video[vid]), reverse=True
    )
    total_videos = len(ranked_video_ids)
    page_ids = ranked_video_ids[offset : offset + limit]
    if not page_ids:
        return PaginatedSearchGroups(groups=[], total_videos=total_videos)

    videos = {
        video.id: video
        for video in session.execute(select(Video).where(Video.id.in_(page_ids))).scalars()
    }
    thumbnail_video_ids = set(
        session.execute(
            select(VideoAsset.video_id).where(
                VideoAsset.video_id.in_(page_ids), VideoAsset.type == AssetType.THUMBNAIL
            )
        ).scalars()
    )
    breadcrumbs = build_folder_breadcrumbs(session, (video.folder_id for video in videos.values()))

    groups: list[SearchGroup] = []
    for video_id in page_ids:
        video = videos.get(video_id)
        if video is None:
            continue
        video_hits = sorted(by_video[video_id], key=_hit_sort_key)
        groups.append(
            SearchGroup(
                video_id=video_id,
                video_name=video.name,
                folder_path=breadcrumbs.get(video.folder_id, []),
                has_thumbnail=video_id in thumbnail_video_ids,
                hits=video_hits[:MAX_HITS_PER_VIDEO],
                hit_count=len(video_hits),
            )
        )
    return PaginatedSearchGroups(groups=groups, total_videos=total_videos)
