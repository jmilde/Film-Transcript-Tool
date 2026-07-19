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


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
