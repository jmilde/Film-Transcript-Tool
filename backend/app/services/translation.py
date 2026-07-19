"""Build a translated transcript from a source transcript.

Translation reflows text, so there is no word-for-word alignment with the source
(``docs/500_transcript_model.md`` §13: the relationship to original tokens is not
required for v1). Instead each source *segment* is translated as a unit and its
translated words are laid back over the segment's time range with evenly
interpolated timestamps. The translation is a fully independent transcript
(its own segments/tokens/edits) that reuses the video's speakers; editing or
regenerating it never touches the source (``docs/100_product_spec.md`` §11).
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.transcript import (
    Transcript,
    TranscriptSegment,
    TranscriptToken,
    TranscriptType,
)


@dataclass(frozen=True)
class SourceSegment:
    """One source segment reduced to what translation needs."""

    speaker_id: uuid.UUID | None
    start_time: float
    end_time: float
    text: str


def collect_source_segments(session: Session, transcript: Transcript) -> list[SourceSegment]:
    """Reduce a transcript's current visible content to translatable segments.

    Uses displayed text (``edited_text`` over ``original_text``), excludes deleted
    tokens, preserves ordering, and takes each segment's time range from its first
    and last visible token. Segments left empty by deletions are dropped.
    """
    segments = list(
        session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )

    tokens = list(
        session.execute(
            select(TranscriptToken)
            .where(
                TranscriptToken.transcript_id == transcript.id,
                TranscriptToken.is_deleted.is_(False),
            )
            .order_by(TranscriptToken.position)
        )
        .scalars()
        .all()
    )
    tokens_by_segment: dict[uuid.UUID, list[TranscriptToken]] = {}
    for token in tokens:
        tokens_by_segment.setdefault(token.segment_id, []).append(token)

    sources: list[SourceSegment] = []
    for segment in segments:
        segment_tokens = tokens_by_segment.get(segment.id, [])
        if not segment_tokens:
            continue
        text = " ".join(
            token.edited_text if token.edited_text is not None else token.original_text
            for token in segment_tokens
        )
        sources.append(
            SourceSegment(
                speaker_id=segment.speaker_id,
                start_time=segment_tokens[0].start_time,
                end_time=segment_tokens[-1].end_time,
                text=text,
            )
        )
    return sources


def interpolate_token_times(count: int, start: float, end: float) -> list[tuple[float, float]]:
    """Split ``[start, end]`` into ``count`` contiguous, non-overlapping intervals.

    Used to lay translated words back over a source segment's duration when there
    is no per-word timing from the translator. A zero-length range yields
    degenerate (equal-endpoint) intervals rather than negative ones.
    """
    if count <= 0:
        return []
    span = end - start
    intervals: list[tuple[float, float]] = []
    for index in range(count):
        token_start = start + span * index / count
        token_end = start + span * (index + 1) / count
        intervals.append((token_start, token_end))
    return intervals


def create_translation_transcript(
    session: Session,
    source: Transcript,
    sources: list[SourceSegment],
    translated_texts: list[str],
    *,
    target_language: str,
    created_by: uuid.UUID,
) -> Transcript:
    """Persist a new translation transcript from per-segment translated text.

    ``translated_texts`` aligns positionally with ``sources``. Each translated
    string is split into word tokens whose timestamps interpolate the matching
    source segment's range; the source segment's speaker is reused. Segments whose
    translation is blank are skipped.
    """
    if len(sources) != len(translated_texts):
        raise ValueError("sources and translated_texts must be the same length")

    translation = Transcript(
        video_id=source.video_id,
        project_id=source.project_id,
        language=target_language,
        type=TranscriptType.TRANSLATION,
        # Translations regenerate from the source; no provider payload is kept.
        provider_raw_response=None,
        created_by=created_by,
    )
    session.add(translation)
    session.flush()

    for segment_index, (segment_source, translated_text) in enumerate(
        zip(sources, translated_texts, strict=True)
    ):
        words = translated_text.split()
        if not words:
            continue
        segment = TranscriptSegment(
            transcript_id=translation.id,
            speaker_id=segment_source.speaker_id,
            position=Decimal(segment_index + 1),
        )
        session.add(segment)
        session.flush()

        times = interpolate_token_times(
            len(words), segment_source.start_time, segment_source.end_time
        )
        for token_index, (word, (token_start, token_end)) in enumerate(zip(words, times)):
            session.add(
                TranscriptToken(
                    transcript_id=translation.id,
                    segment_id=segment.id,
                    project_id=source.project_id,
                    original_text=word,
                    edited_text=None,
                    start_time=token_start,
                    end_time=token_end,
                    is_deleted=False,
                    position=Decimal(token_index + 1),
                    created_by=created_by,
                    updated_by=created_by,
                )
            )
    session.flush()
    return translation
