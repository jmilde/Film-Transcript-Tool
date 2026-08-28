import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.video import Video


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


def resolve_descendant_video_ids(session: Session, folder_id: uuid.UUID) -> set[uuid.UUID]:
    """Every video id anywhere in ``folder_id``'s subtree, including its own.

    Walks ``parent_folder_id`` breadth-first *down* from ``folder_id`` (the
    mirror image of ``build_folder_breadcrumbs``' upward walk), one query per
    tree depth rather than one per folder. Returns an empty set — not an
    error — if the folder has no videos anywhere in its subtree, including
    when ``folder_id`` itself doesn't exist.
    """
    folder_ids = {folder_id}
    frontier = {folder_id}
    while frontier:
        children = set(
            session.execute(
                select(Folder.id).where(Folder.parent_folder_id.in_(frontier))
            ).scalars()
        )
        frontier = children - folder_ids
        folder_ids |= frontier

    return set(session.execute(select(Video.id).where(Video.folder_id.in_(folder_ids))).scalars())
