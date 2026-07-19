import io
from pathlib import Path

import pytest
from app.storage.base import StoragePathError
from app.storage.local import LocalStorage


def test_save_and_open_roundtrip(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    storage.save("videos/a/original.mp4", io.BytesIO(b"hello"))

    with storage.open("videos/a/original.mp4") as f:
        assert f.read() == b"hello"


def test_exists_and_delete(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    key = "videos/a/original.mp4"

    assert storage.exists(key) is False
    storage.save(key, io.BytesIO(b"x"))
    assert storage.exists(key) is True
    storage.delete(key)
    assert storage.exists(key) is False


def test_delete_missing_is_noop(tmp_path: Path) -> None:
    LocalStorage(tmp_path).delete("nope/none.bin")


def test_path_for_within_root(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    path = storage.path_for("videos/a/original.mp4")

    assert str(path).startswith(str(tmp_path.resolve()))


@pytest.mark.parametrize("bad", ["../escape.txt", "/etc/passwd", "a/../../b", ""])
def test_path_traversal_rejected(tmp_path: Path, bad: str) -> None:
    storage = LocalStorage(tmp_path)
    with pytest.raises(StoragePathError):
        storage.path_for(bad)
