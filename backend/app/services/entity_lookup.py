"""Resolve a speaker/video/folder name fragment to its exact, canonical form.

Backs the chat agent's ``lookup_entities`` tool: the model gets a typo or
partial name from the user and needs the exact string/id to scope a
``search_transcripts`` call by ``speaker_name``/``video_id``/``folder_id``.
Uses plain case-insensitive ``ILIKE`` substring matching, not the stemmed
full-text search ``app/services/search.py`` uses for the classic project
search page — ILIKE tolerates a typo/partial fragment better than a stemmed
tsvector match would, and this module intentionally doesn't touch
``search.py``, which backs an unrelated feature.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.speaker import Speaker
from app.models.video import Video
from app.services.folders import build_folder_breadcrumbs


@dataclass
class SpeakerMatch:
    """One distinct speaker name, with every video it occurs in.

    A ``Speaker`` row is per-video, so one real person recurring across
    several videos under the same name is grouped into a single match here
    rather than returned as separate hits.
    """

    name: str
    video_ids: list[uuid.UUID]


@dataclass
class VideoMatch:
    video_id: uuid.UUID
    name: str
    folder_path: list[str]


@dataclass
class FolderMatch:
    folder_id: uuid.UUID
    name: str
    path: list[str]


@dataclass
class EntityLookupResult:
    speakers: list[SpeakerMatch]
    videos: list[VideoMatch]
    folders: list[FolderMatch]


def lookup_entities(
    session: Session, project_id: uuid.UUID, term: str, *, limit: int = 10
) -> EntityLookupResult:
    """Match ``term`` against speaker/video/folder names within ``project_id``.

    Three independent ``ILIKE('%term%')`` queries, each capped at ``limit``
    rows. No match in any category returns empty lists, not an error.
    """
    pattern = f"%{term}%"

    speakers_by_name: dict[str, list[uuid.UUID]] = {}
    for name, video_id in session.execute(
        select(Speaker.name, Speaker.video_id)
        .where(Speaker.project_id == project_id, Speaker.name.ilike(pattern))
        .limit(limit)
    ).all():
        speakers_by_name.setdefault(name, []).append(video_id)
    speakers = [
        SpeakerMatch(name=name, video_ids=video_ids) for name, video_ids in speakers_by_name.items()
    ]

    videos = list(
        session.execute(
            select(Video)
            .where(Video.project_id == project_id, Video.name.ilike(pattern))
            .limit(limit)
        ).scalars()
    )
    video_breadcrumbs = build_folder_breadcrumbs(session, (video.folder_id for video in videos))
    video_matches = [
        VideoMatch(
            video_id=video.id,
            name=video.name,
            folder_path=video_breadcrumbs.get(video.folder_id, []),
        )
        for video in videos
    ]

    folders = list(
        session.execute(
            select(Folder)
            .where(Folder.project_id == project_id, Folder.name.ilike(pattern))
            .limit(limit)
        ).scalars()
    )
    # A folder's own path is its *parent's* breadcrumbs, not its own — using
    # its own id would duplicate the matched folder's name in both `name` and
    # `path`.
    parent_breadcrumbs = build_folder_breadcrumbs(
        session,
        (folder.parent_folder_id for folder in folders if folder.parent_folder_id is not None),
    )
    folder_matches = [
        FolderMatch(
            folder_id=folder.id,
            name=folder.name,
            path=(
                parent_breadcrumbs.get(folder.parent_folder_id, [])
                if folder.parent_folder_id is not None
                else []
            ),
        )
        for folder in folders
    ]

    return EntityLookupResult(speakers=speakers, videos=video_matches, folders=folder_matches)
