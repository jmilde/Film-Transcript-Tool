"""Live OpenRouter embeddings integration test.

Hits the network with a real key, so it is marked ``integration`` (deselect
with ``-m 'not integration'``) and skips when no key is configured.
"""

import pytest
from app.config import get_settings
from app.embeddings.openrouter import OpenRouterEmbeddingsProvider

_SETTINGS = get_settings()

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        _SETTINGS.openrouter_api_key in ("", "placeholder"),
        reason="OPENROUTER_API_KEY not configured (real key required for the live call)",
    ),
]


def test_embed_returns_vectors_of_the_configured_dimension() -> None:
    provider = OpenRouterEmbeddingsProvider(
        model=_SETTINGS.embeddings_model, api_key=_SETTINGS.openrouter_api_key
    )

    vectors = provider.embed(["hello world", "a second passage of text"])

    assert len(vectors) == 2
    assert all(len(vector) == _SETTINGS.embeddings_dimension for vector in vectors)
