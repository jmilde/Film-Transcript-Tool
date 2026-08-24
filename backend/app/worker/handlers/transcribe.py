from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.transcript import Transcript, TranscriptType
from app.services.transcripts import create_transcript_from_normalized
from app.storage import factory as storage_factory
from app.transcription import factory as transcription_factory
from app.transcription.normalize import normalize
from app.worker.media import HandlerInputError, audio_key, require_video


def handle_transcribe(session: Session, job: ProcessingJob) -> dict[str, Any] | None:
    """Send the extracted audio to Deepgram and populate the transcript.

    Idempotent: if the video already has an original transcript (a prior run
    succeeded) skip rather than re-transcribe. The extracted audio is produced
    by the preceding ``extract_audio`` stage.
    """
    video = require_video(session, job)
    existing = session.execute(
        select(Transcript.id).where(
            Transcript.video_id == video.id,
            Transcript.type == TranscriptType.ORIGINAL,
        )
    ).scalar_one_or_none()
    if existing is not None:
        return {
            "skipped": True,
            "reason": "transcript already exists",
            "transcript_id": str(existing),
        }

    storage = storage_factory.get_local_storage()
    key = audio_key(video.id)
    if not storage.exists(key):
        raise HandlerInputError(f"Video {video.id} has no extracted audio")

    provider = transcription_factory.get_transcription_provider()
    raw = provider.transcribe(storage.path_for(key))
    normalized = normalize(raw)
    transcript = create_transcript_from_normalized(
        session, video, normalized, raw, created_by=video.created_by
    )

    # Not part of the auto-chained upload pipeline (see services/pipeline.py) —
    # triggered explicitly here so a fresh transcript is searchable without a
    # manual reindex.
    session.add(
        ProcessingJob(
            video_id=video.id,
            project_id=video.project_id,
            type=JobType.GENERATE_EMBEDDINGS,
            status=JobStatus.PENDING,
            result={"transcript_id": str(transcript.id)},
        )
    )

    return {
        "transcript_id": str(transcript.id),
        "language": normalized.language,
        "segment_count": len(normalized.segments),
        "token_count": sum(len(segment.words) for segment in normalized.segments),
    }
