import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folder import Folder


def build_folder_breadcrumbs(
    session: Session, folder_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    """Map each folder id to its breadcrumb path of ancestor names, root-first.

    Walks ``parent_folder_id`` breadth-first, caching every folder row it loads
    along the way. That makes the cost one query per tree depth rather than one
    query per folder, so sibling videos sharing ancestor folders stay cheap.
    """
    unique_ids = set(folder_ids)
    if not unique_ids:
        return {}

    cache: dict[uuid.UUID, Folder] = {}
    frontier = set(unique_ids)
    while frontier:
        to_load = frontier - cache.keys()
        if not to_load:
            break
        rows = session.execute(select(Folder).where(Folder.id.in_(to_load))).scalars().all()
        for row in rows:
            cache[row.id] = row
        frontier = {row.parent_folder_id for row in rows if row.parent_folder_id is not None}

    def path_for(folder_id: uuid.UUID) -> list[str]:
        names: list[str] = []
        current: uuid.UUID | None = folder_id
        while current is not None:
            folder = cache.get(current)
            if folder is None:
                break
            names.append(folder.name)
            current = folder.parent_folder_id
        names.reverse()
        return names

    return {folder_id: path_for(folder_id) for folder_id in unique_ids}
