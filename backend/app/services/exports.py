"""Assemble and render transcript exports.

Bridges the relational transcript model and the pure renderers: builds an
:class:`~app.export.document.ExportDocument` (resolving edited-vs-original token
text, excluding deleted tokens, ordering, and speaker names per
``docs/900_export.md``), and dispatches rendering by export type.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.export.document import ExportDocument, ExportSegment, ExportToken
from app.export.markdown import render_markdown
from app.export.srt import render_srt
from app.models.export import ExportType
from app.models.speaker import Speaker
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.video import Video

_EXTENSIONS = {ExportType.MARKDOWN: "md", ExportType.SRT: "srt"}


def export_key(export_id: uuid.UUID, export_type: ExportType) -> str:
    """Deterministic storage key for a rendered export file."""
    return f"exports/{export_id}.{_EXTENSIONS[export_type]}"


def build_export_document(session: Session, transcript: Transcript) -> ExportDocument:
    """Build the renderable view of ``transcript``'s current visible content.

    Uses ``edited_text`` where present else ``original_text``, excludes deleted
    tokens, preserves segment/token ordering, and resolves each segment's speaker
    display name (renamed name, else the provider identifier).
    """
    video = session.get(Video, transcript.video_id)
    video_name = video.name if video is not None else ""

    segments = list(
        session.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )

    # Deleted tokens are excluded from exports (they persist for edit history).
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

    speaker_names = _speaker_names(session, segments)

    export_segments: list[ExportSegment] = []
    for segment in segments:
        segment_tokens = tokens_by_segment.get(segment.id, [])
        if not segment_tokens:
            # A segment whose every token was deleted contributes nothing.
            continue
        speaker = speaker_names.get(segment.speaker_id) if segment.speaker_id is not None else None
        export_segments.append(
            ExportSegment(
                speaker=speaker,
                tokens=[
                    ExportToken(
                        text=token.edited_text
                        if token.edited_text is not None
                        else token.original_text,
                        start_time=token.start_time,
                        end_time=token.end_time,
                    )
                    for token in segment_tokens
                ],
            )
        )

    return ExportDocument(
        video_name=video_name,
        language=transcript.language,
        segments=export_segments,
    )


def _speaker_names(
    session: Session, segments: list[TranscriptSegment]
) -> dict[uuid.UUID, str | None]:
    speaker_ids = {segment.speaker_id for segment in segments if segment.speaker_id is not None}
    if not speaker_ids:
        return {}
    speakers = session.execute(select(Speaker).where(Speaker.id.in_(speaker_ids))).scalars().all()
    return {speaker.id: speaker.name or speaker.provider_identifier for speaker in speakers}


def render_export(document: ExportDocument, export_type: ExportType) -> str:
    if export_type is ExportType.MARKDOWN:
        return render_markdown(document)
    return render_srt(document)
