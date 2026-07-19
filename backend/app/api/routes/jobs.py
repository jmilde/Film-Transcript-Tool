from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_job_access
from app.core.errors import BadRequestError
from app.db.session import get_db
from app.models.job import JobStatus, ProcessingJob
from app.schemas.job import JobRead

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=JobRead)
def get_job(job: ProcessingJob = Depends(require_job_access)) -> ProcessingJob:
    return job


@router.post("/jobs/{job_id}/retry", response_model=JobRead)
def retry_job(
    job: ProcessingJob = Depends(require_job_access),
    db: Session = Depends(get_db),
) -> ProcessingJob:
    if job.status != JobStatus.FAILED:
        raise BadRequestError("Only failed jobs can be retried")
    job.status = JobStatus.PENDING
    job.error_message = None
    job.started_at = None
    job.completed_at = None
    job.progress = 0
    db.commit()
    db.refresh(job)
    return job
