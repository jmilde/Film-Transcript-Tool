import uuid

from pydantic import BaseModel, ConfigDict


class SearchResult(BaseModel):
    """One matching location returned by project search.

    ``kind`` is ``transcript`` (a token), ``speaker``, or ``comment``.
    ``video_id`` locates the result for navigation; ``start_time`` is the video
    position to seek to (``None`` for speaker matches, which are video-level).
    Results are ordered by ``rank`` (descending) across all three sources.
    """

    model_config = ConfigDict(from_attributes=True)

    kind: str
    id: uuid.UUID
    video_id: uuid.UUID
    transcript_id: uuid.UUID | None
    text: str
    start_time: float | None
    rank: float
