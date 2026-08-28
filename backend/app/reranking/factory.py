from app.config import get_settings
from app.reranking.base import RerankProvider
from app.reranking.openrouter import OpenRouterRerankProvider


def get_rerank_provider() -> RerankProvider:
    """Build the configured rerank provider.

    Indirected through a factory (like ``app.translation.factory``) so callers
    can be tested with a fake provider. The return type is the
    provider-agnostic protocol.
    """
    settings = get_settings()
    return OpenRouterRerankProvider(
        model=settings.rerank_model, api_key=settings.openrouter_api_key
    )
