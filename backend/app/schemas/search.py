import uuid

from pydantic import BaseModel, ConfigDict


class SearchHitRead(BaseModel):
    """One matching location within a video, returned inside a ``SearchVideoGroup``.

    ``kind`` is ``transcript`` (a token), ``speaker``, or ``comment``.
    ``start_time`` is the video position to seek to (``None`` for speaker
    matches, which are video-level).
    """

    model_config = ConfigDict(from_attributes=True)

    kind: str
    id: uuid.UUID
    transcript_id: uuid.UUID | None
    text: str
    start_time: float | None
    rank: float


class SearchVideoGroup(BaseModel):
    """All matches within a single video, with enough context to render a card."""

    video_id: uuid.UUID
    video_name: str
    folder_path: list[str]
    thumbnail_token: str | None
    hits: list[SearchHitRead]
    hit_count: int


class SearchResponse(BaseModel):
    """A page of video groups, ranked by each group's best-hit rank descending."""

    groups: list[SearchVideoGroup]
    total_videos: int
    limit: int
    offset: int
