import uuid
from collections.abc import Iterable
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folder import Folder


class FolderBreadcrumb(NamedTuple):
    id: uuid.UUID
    name: str


def build_folder_breadcrumb_entries(
    session: Session, folder_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[FolderBreadcrumb]]:
    """Map each folder id to its breadcrumb path of ancestors (id + name), root-first.

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

    def path_for(folder_id: uuid.UUID) -> list[FolderBreadcrumb]:
        entries: list[FolderBreadcrumb] = []
        current: uuid.UUID | None = folder_id
        while current is not None:
            folder = cache.get(current)
            if folder is None:
                break
            entries.append(FolderBreadcrumb(id=folder.id, name=folder.name))
            current = folder.parent_folder_id
        entries.reverse()
        return entries

    return {folder_id: path_for(folder_id) for folder_id in unique_ids}


def build_folder_breadcrumbs(
    session: Session, folder_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    """Name-only breadcrumb path — the shape most callers (search/chat/document
    summaries) actually need. See `build_folder_breadcrumb_entries` for the
    id+name shape the video route uses to make each ancestor linkable."""
    entries = build_folder_breadcrumb_entries(session, folder_ids)
    return {folder_id: [entry.name for entry in path] for folder_id, path in entries.items()}
