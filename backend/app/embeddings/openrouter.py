"""Embeddings via OpenRouter, through PydanticAI's OpenAI-compatible support.

OpenRouter's embeddings endpoint is OpenAI-request-compatible, so this needs
no custom HTTP code: ``OpenAIEmbeddingModel`` talks to it once pointed at
OpenRouter's base URL via ``OpenAIProvider``. Only the sync entry point is
used — the rest of the codebase has no async DB/session layer.
"""

from pydantic_ai.embeddings import Embedder
from pydantic_ai.embeddings.openai import OpenAIEmbeddingModel
from pydantic_ai.providers.openai import OpenAIProvider

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterEmbeddingsProvider:
    """Embed text via an OpenRouter-hosted embeddings model."""

    def __init__(self, *, model: str, api_key: str) -> None:
        self._embedder = Embedder(
            OpenAIEmbeddingModel(
                model, provider=OpenAIProvider(base_url=OPENROUTER_BASE_URL, api_key=api_key)
            )
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        result = self._embedder.embed_documents_sync(texts)
        return [list(vector) for vector in result.embeddings]
