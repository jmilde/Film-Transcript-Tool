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
    # Semantic chat search: all AI calls (agent, embeddings, rerank) go through
    # OpenRouter with this one key.
    openrouter_api_key: str
    embeddings_model: str = "openai/text-embedding-3-small"
    embeddings_dimension: int = 1536
    rerank_model: str = "cohere/rerank-v3.5"
    # The leading `~` is OpenRouter's "latest" alias marker (its model listing
    # exposes `google/gemini-flash-latest` only as `~google/gemini-flash-latest`
    # — the bare, unprefixed id 400s).
    chat_agent_model: str = "openrouter:~google/gemini-flash-latest"
    # Browser origins allowed to call the API (the frontend dev server by
    # default). Override via CORS_ALLOW_ORIGINS as a JSON array.
    cors_allow_origins: list[str] = ["http://localhost:5173"]
    # Secret for signing short-lived media-access tokens. A browser <video>/<img>
    # src cannot send an Authorization header, so media routes accept a signed
    # ?token= minted by an authorized endpoint instead. MUST be overridden with a
    # strong random value in production; the default is for local dev/tests only.
    media_token_secret: str = "dev-insecure-media-token-secret"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
