"""Debounced re-embedding after transcript edits.

Auto-embedding runs once, right after transcription/translation completes
(see ``app/worker/handlers/transcribe.py``/``translate.py``). Edits made
afterwards (``app/services/tokens.py``) don't touch that job — instead every
edit calls ``schedule_reembed``, which either creates a pending
``GENERATE_EMBEDDINGS`` job set to run a short delay from now, or, if one is
already pending for this transcript, just pushes its ``run_after`` further
out. That means a burst of edits in one sitting collapses into a single
re-embed fired shortly after the user stops editing, instead of one job per
keystroke-level save.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.transcript import Transcript

# How long a transcript must go untouched before its debounced re-embed fires.
REEMBED_DEBOUNCE_SECONDS = 30


def schedule_reembed(session: Session, transcript_id: uuid.UUID) -> None:
    """Ensure exactly one debounced re-embed job is pending for ``transcript_id``."""
    transcript = session.get(Transcript, transcript_id)
    if transcript is None:
        return

    run_after = datetime.now(UTC) + timedelta(seconds=REEMBED_DEBOUNCE_SECONDS)
    pending = session.execute(
        select(ProcessingJob).where(
            ProcessingJob.type == JobType.GENERATE_EMBEDDINGS,
            ProcessingJob.status == JobStatus.PENDING,
            ProcessingJob.result["transcript_id"].astext == str(transcript_id),
        )
    ).scalar_one_or_none()
    if pending is not None:
        pending.run_after = run_after
        return

    session.add(
        ProcessingJob(
            video_id=transcript.video_id,
            project_id=transcript.project_id,
            type=JobType.GENERATE_EMBEDDINGS,
            status=JobStatus.PENDING,
            run_after=run_after,
            result={"transcript_id": str(transcript_id), "force": True},
        )
    )
