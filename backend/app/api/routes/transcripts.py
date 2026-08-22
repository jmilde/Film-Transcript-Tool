import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_min_role, require_transcript_access, require_video_access
from app.db.session import get_db
from app.models.job import JobStatus, JobType, ProcessingJob
from app.models.membership import MembershipRole
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken
from app.models.video import Video
from app.schemas.transcript import (
    SegmentRead,
    TokenRead,
    TranscriptRead,
    TranscriptSummary,
    TranslationCreate,
    TranslationResponse,
)

router = APIRouter(tags=["transcripts"])


@router.get("/videos/{video_id}/transcripts", response_model=list[TranscriptSummary])
def list_transcripts(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
) -> list[Transcript]:
    return list(
        db.execute(
            select(Transcript)
            .where(Transcript.video_id == video.id)
            .order_by(Transcript.created_at)
        )
        .scalars()
        .all()
    )


@router.get("/transcripts/{transcript_id}", response_model=TranscriptRead)
def get_transcript(
    transcript: Transcript = Depends(require_transcript_access),
    db: Session = Depends(get_db),
) -> TranscriptRead:
    segments = list(
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == transcript.id)
            .order_by(TranscriptSegment.position)
        )
        .scalars()
        .all()
    )
    # Deleted tokens do not appear in the transcript (they persist for history).
    tokens = list(
        db.execute(
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

    return TranscriptRead(
        id=transcript.id,
        video_id=transcript.video_id,
        language=transcript.language,
        type=transcript.type,
        created_at=transcript.created_at,
        segments=[
            SegmentRead(
                id=segment.id,
                speaker_id=segment.speaker_id,
                tokens=[
                    TokenRead(
                        id=token.id,
                        segment_id=token.segment_id,
                        original_text=token.original_text,
                        edited_text=token.edited_text,
                        text=token.edited_text
                        if token.edited_text is not None
                        else token.original_text,
                        start_time=token.start_time,
                        end_time=token.end_time,
                        version=token.version,
                    )
                    for token in tokens_by_segment.get(segment.id, [])
                ],
            )
            for segment in segments
        ],
    )


@router.post("/transcripts/{transcript_id}/translate", response_model=TranslationResponse)
def create_translation(
    payload: TranslationCreate,
    transcript: Transcript = Depends(
        require_min_role(require_transcript_access, MembershipRole.EDITOR)
    ),
    db: Session = Depends(get_db),
) -> TranslationResponse:
    """Request a translation: enqueue the worker that produces it.

    The long-running translation runs in the worker, never inline. The job
    carries the source transcript and target language; the worker builds a new
    translation transcript and leaves the source untouched.
    """
    job = ProcessingJob(
        video_id=transcript.video_id,
        project_id=transcript.project_id,
        type=JobType.TRANSLATE,
        status=JobStatus.PENDING,
        result={
            "source_transcript_id": str(transcript.id),
            "target_language": payload.target_language,
        },
    )
    db.add(job)
    db.flush()
    db.commit()
    return TranslationResponse(job_id=job.id)
