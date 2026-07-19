"""Build the relational transcript model from normalized provider output.

Turns a :class:`~app.transcription.normalize.NormalizedTranscript` into
``Transcript`` / ``Speaker`` / ``TranscriptSegment`` / ``TranscriptToken`` rows.
Speakers belong to the video and are reused across transcripts, so this
get-or-creates them by provider identifier.
"""

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.speaker import Speaker
from app.models.transcript import (
    Transcript,
    TranscriptSegment,
    TranscriptToken,
    TranscriptType,
)
from app.models.video import Video
from app.transcription.normalize import NormalizedTranscript


def _get_or_create_speaker(
    session: Session,
    video: Video,
    provider_identifier: str | None,
    cache: dict[str, Speaker],
) -> Speaker | None:
    if provider_identifier is None:
        return None
    if provider_identifier in cache:
        return cache[provider_identifier]
    speaker = session.execute(
        select(Speaker).where(
            Speaker.video_id == video.id,
            Speaker.provider_identifier == provider_identifier,
        )
    ).scalar_one_or_none()
    if speaker is None:
        speaker = Speaker(
            video_id=video.id,
            project_id=video.project_id,
            provider_identifier=provider_identifier,
        )
        session.add(speaker)
        session.flush()
    cache[provider_identifier] = speaker
    return speaker


def create_transcript_from_normalized(
    session: Session,
    video: Video,
    normalized: NormalizedTranscript,
    raw_response: dict[str, Any],
    *,
    created_by: uuid.UUID,
    type_: TranscriptType = TranscriptType.ORIGINAL,
) -> Transcript:
    transcript = Transcript(
        video_id=video.id,
        project_id=video.project_id,
        language=normalized.language,
        type=type_,
        # Raw response is kept only for the original (translations regenerate).
        provider_raw_response=raw_response if type_ is TranscriptType.ORIGINAL else None,
        created_by=created_by,
    )
    session.add(transcript)
    session.flush()

    speaker_cache: dict[str, Speaker] = {}
    for segment_index, normalized_segment in enumerate(normalized.segments):
        speaker = _get_or_create_speaker(session, video, normalized_segment.speaker, speaker_cache)
        segment = TranscriptSegment(
            transcript_id=transcript.id,
            speaker_id=speaker.id if speaker is not None else None,
            position=Decimal(segment_index + 1),
        )
        session.add(segment)
        session.flush()
        for token_index, word in enumerate(normalized_segment.words):
            session.add(
                TranscriptToken(
                    transcript_id=transcript.id,
                    segment_id=segment.id,
                    project_id=video.project_id,
                    original_text=word.text,
                    edited_text=None,
                    start_time=word.start,
                    end_time=word.end,
                    is_deleted=False,
                    position=Decimal(token_index + 1),
                    created_by=created_by,
                    updated_by=created_by,
                )
            )
    session.flush()
    return transcript
