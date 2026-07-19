from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    database_url_worker: str
    supabase_url: str
    supabase_publishable_key: str
    supabase_jwks_url: str
    deepgram_api_key: str
    deepl_api_key: str
    storage_root: str
    # Browser origins allowed to call the API (the frontend dev server by
    # default). Override via CORS_ALLOW_ORIGINS as a JSON array.
    cors_allow_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
