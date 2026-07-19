import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import ProcessingJob
from app.models.transcript import Transcript, TranscriptType
from app.services.translation import collect_source_segments, create_translation_transcript
from app.translation import factory as translation_factory


def handle_translate(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Translate a source transcript into a new translation transcript.

    Reads the source transcript id and target language from ``job.result`` (set
    when the job was enqueued). Idempotent: if a translation for the same video
    and target language already exists (a prior run succeeded), skip rather than
    create a duplicate. Never mutates the source transcript.
    """
    data = job.result or {}
    source_id = data.get("source_transcript_id")
    target_language = data.get("target_language")
    if source_id is None or target_language is None:
        raise RuntimeError("Translate job is missing source_transcript_id/target_language")

    source = session.get(Transcript, uuid.UUID(str(source_id)))
    if source is None:
        raise RuntimeError(f"Source transcript {source_id} for translation no longer exists")

    existing = session.execute(
        select(Transcript.id).where(
            Transcript.video_id == source.video_id,
            Transcript.type == TranscriptType.TRANSLATION,
            Transcript.language == target_language,
        )
    ).scalar_one_or_none()
    if existing is not None:
        return {
            "skipped": True,
            "reason": "translation already exists",
            "transcript_id": str(existing),
            "source_transcript_id": str(source.id),
            "target_language": target_language,
        }

    if source.language is None:
        raise RuntimeError(
            f"Source transcript {source.id} has no language; cannot translate to {target_language}"
        )

    sources = collect_source_segments(session, source)
    provider = translation_factory.get_translation_provider()
    translated_texts = provider.translate(
        [segment.text for segment in sources],
        source_language=source.language,
        target_language=target_language,
    )
    translation = create_translation_transcript(
        session,
        source,
        sources,
        translated_texts,
        target_language=target_language,
        created_by=source.created_by,
    )

    return {
        "transcript_id": str(translation.id),
        "source_transcript_id": str(source.id),
        "target_language": target_language,
        "segment_count": len(sources),
    }
