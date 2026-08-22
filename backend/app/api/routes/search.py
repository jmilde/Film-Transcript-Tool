from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_project_member
from app.core.media_token import mint_media_token
from app.db.session import get_db
from app.models.project import Project
from app.schemas.search import SearchHitRead, SearchResponse, SearchVideoGroup
from app.services.search import group_search_hits

router = APIRouter(tags=["search"])


@router.get("/projects/{project_id}/search", response_model=SearchResponse)
def search(
    q: str,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> SearchResponse:
    paginated = group_search_hits(db, project.id, q, limit=limit, offset=offset)
    groups = [
        SearchVideoGroup(
            video_id=group.video_id,
            video_name=group.video_name,
            folder_path=group.folder_path,
            thumbnail_token=mint_media_token(group.video_id) if group.has_thumbnail else None,
            hits=[SearchHitRead.model_validate(hit) for hit in group.hits],
            hit_count=group.hit_count,
        )
        for group in paginated.groups
    ]
    return SearchResponse(
        groups=groups, total_videos=paginated.total_videos, limit=limit, offset=offset
    )
