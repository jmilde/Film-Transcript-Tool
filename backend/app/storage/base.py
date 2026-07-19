from pathlib import Path
from typing import BinaryIO, Protocol


class StoragePathError(ValueError):
    """Raised when a logical storage key would escape the storage root."""


class Storage(Protocol):
    """Abstraction over media storage.

    Callers deal only in logical keys (e.g. ``videos/{id}/original.mp4``); the
    database never stores absolute filesystem paths or provider URLs, so a local
    filesystem backend can later be swapped for Supabase Storage/S3.
    """

    def save(self, key: str, data: BinaryIO) -> None: ...

    def open(self, key: str) -> BinaryIO: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def path_for(self, key: str) -> Path: ...
