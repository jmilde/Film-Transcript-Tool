"""Live OpenRouter rerank integration test.

Hits the network with a real key, so it is marked ``integration`` (deselect
with ``-m 'not integration'``) and skips when no key is configured.
"""

import pytest
from app.config import get_settings
from app.reranking.openrouter import OpenRouterRerankProvider

_SETTINGS = get_settings()

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        _SETTINGS.openrouter_api_key in ("", "placeholder"),
        reason="OPENROUTER_API_KEY not configured (real key required for the live call)",
    ),
]


def test_rerank_ranks_the_relevant_document_first() -> None:
    provider = OpenRouterRerankProvider(
        model=_SETTINGS.rerank_model, api_key=_SETTINGS.openrouter_api_key
    )

    documents = [
        "The church stood quietly at the edge of the village.",
        "The recipe calls for two cups of flour and a pinch of salt.",
    ]
    scores = provider.rerank("Is there any dialogue about a church?", documents)

    assert len(scores) == 2
    assert scores[0] > scores[1]
