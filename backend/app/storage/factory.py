from app.config import get_settings
from app.storage.local import LocalStorage


def get_local_storage() -> LocalStorage:
    """Build the configured local storage backend from settings.

    Shared by the API dependency (``app.api.deps.get_storage``) and the worker
    media handlers so both resolve logical keys against the same storage root.
    """
    return LocalStorage(get_settings().storage_root)
