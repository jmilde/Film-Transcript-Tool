from app.config import get_settings
from app.embeddings.base import EmbeddingsProvider
from app.embeddings.openrouter import OpenRouterEmbeddingsProvider


def get_embeddings_provider() -> EmbeddingsProvider:
    """Build the configured embeddings provider.

    Indirected through a factory (like ``app.translation.factory``) so callers
    can be tested with a fake provider. The return type is the
    provider-agnostic protocol.
    """
    settings = get_settings()
    return OpenRouterEmbeddingsProvider(
        model=settings.embeddings_model, api_key=settings.openrouter_api_key
    )
