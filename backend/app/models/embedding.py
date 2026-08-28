import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Float, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

# Fixed to the current default embedding model (openai/text-embedding-3-small).
# Changing models requires a migration + full re-embed, not just a config change.
EMBEDDING_DIMENSION = 1536


class TranscriptChunk(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One retrievable, embedded slice of a transcript for semantic search.

    One row per ``TranscriptSegment``, sub-split into consecutive same-segment
    chunks for segments over ~800 chars (no cross-segment windows). Every
    transcript (original and translations) is embedded for multilingual
    recall, but citations always resolve to the original-language transcript's
    chunk covering the same time range — see ``docs/1000_semantic_search.md``.
    """

    __tablename__ = "transcript_chunks"
    __table_args__ = (
        # Powers the chunk-level full-text search leg of hybrid retrieval.
        Index("ix_transcript_chunks_search_vector", "search_vector", postgresql_using="gin"),
        # Approximate nearest-neighbor index for the vector search leg.
        Index(
            "ix_transcript_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcripts.id", ondelete="CASCADE"), index=True
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), index=True
    )
    # Denormalized owning project for O(1) authorization.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    # Copied from Transcript.language; drives the search_vector text-search config.
    language: Mapped[str | None]
    segment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), index=True
    )
    # Token-id based (not just times) so the frontend's token-range highlight
    # mechanism (useSelectionStore.setRange) can select the full chunk span.
    start_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_tokens.id", ondelete="CASCADE")
    )
    end_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcript_tokens.id", ondelete="CASCADE")
    )
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[float] = mapped_column(Float)
    # Denormalized for citation cards without a join back to Speaker.
    speaker_name: Mapped[str | None]
    # Ordinal of this chunk within its segment (0 unless the segment was
    # sub-split for length).
    chunk_index: Mapped[int]
    # Materialized coalesce(edited_text, original_text) over the chunk's
    # tokens, built by the embedding job (aggregating across token rows can't
    # be a DB-computed column).
    text: Mapped[str]
    # Plain column (not Computed(...)) — the search-text-search config varies
    # per row by language, unlike the hardcoded 'english' on TranscriptToken.
    # Populated explicitly by the embedding job.
    search_vector: Mapped[str] = mapped_column(TSVECTOR)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSION))
    embedding_model: Mapped[str]
