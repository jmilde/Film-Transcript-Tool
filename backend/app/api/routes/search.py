from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_project_member
from app.db.session import get_db
from app.models.project import Project
from app.schemas.search import SearchResult
from app.services.search import search_project

router = APIRouter(tags=["search"])


@router.get("/projects/{project_id}/search", response_model=list[SearchResult])
def search(
    q: str,
    project: Project = Depends(require_project_member),
    db: Session = Depends(get_db),
) -> list[SearchResult]:
    hits = search_project(db, project.id, q)
    return [SearchResult.model_validate(hit) for hit in hits]
