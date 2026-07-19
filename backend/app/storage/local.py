import shutil
from pathlib import Path
from typing import BinaryIO, cast

from app.storage.base import StoragePathError


class LocalStorage:
    """Local filesystem implementation of the :class:`Storage` protocol.

    Logical keys are resolved relative to a single root directory. Any key that
    resolves outside that root (absolute paths, ``..`` traversal) is rejected.
    """

    def __init__(self, root: Path | str) -> None:
        self._root = Path(root).resolve()

    def _resolve(self, key: str) -> Path:
        if not key or key.startswith("/") or "\x00" in key:
            raise StoragePathError(key)
        candidate = (self._root / key).resolve()
        if candidate != self._root and self._root not in candidate.parents:
            raise StoragePathError(key)
        return candidate

    def path_for(self, key: str) -> Path:
        return self._resolve(key)

    def save(self, key: str, data: BinaryIO) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as dst:
            shutil.copyfileobj(data, dst)

    def open(self, key: str) -> BinaryIO:
        return cast(BinaryIO, self._resolve(key).open("rb"))

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._resolve(key).exists()
