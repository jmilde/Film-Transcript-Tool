import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.comment import Comment, CommentRange
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptToken


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
