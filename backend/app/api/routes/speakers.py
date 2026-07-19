from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_speaker_access, require_video_access
from app.db.session import get_db
from app.models.speaker import Speaker
from app.models.video import Video
from app.schemas.speaker import SpeakerRead, SpeakerUpdate

router = APIRouter(tags=["speakers"])


@router.get("/videos/{video_id}/speakers", response_model=list[SpeakerRead])
def list_speakers(
    video: Video = Depends(require_video_access),
    db: Session = Depends(get_db),
) -> list[Speaker]:
    return list(
        db.execute(
            select(Speaker)
            .where(Speaker.video_id == video.id)
            .order_by(Speaker.provider_identifier)
        )
        .scalars()
        .all()
    )


@router.patch("/speakers/{speaker_id}", response_model=SpeakerRead)
def update_speaker(
    payload: SpeakerUpdate,
    speaker: Speaker = Depends(require_speaker_access),
    db: Session = Depends(get_db),
) -> Speaker:
    fields = payload.model_fields_set
    if "name" in fields:
        speaker.name = payload.name
    if "color" in fields:
        speaker.color = payload.color
    db.commit()
    db.refresh(speaker)
    return speaker
