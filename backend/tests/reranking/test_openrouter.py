from typing import Any

import httpx
import pytest
from app.reranking.openrouter import (
    OPENROUTER_RERANK_URL,
    OpenRouterRerankError,
    OpenRouterRerankProvider,
)


def test_rerank_sends_query_and_documents_and_reorders_scores_by_input_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = OpenRouterRerankProvider(model="cohere/rerank-v3.5", api_key="key")
    captured: dict[str, Any] = {}

    def fake_post(
        url: str, *, headers: dict[str, str], json: dict[str, Any], timeout: float
    ) -> httpx.Response:
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        # Provider returns results out of order, to prove the caller un-permutes
        # by `index` rather than trusting response order.
        return httpx.Response(
            200,
            json={
                "results": [
                    {"index": 1, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.2},
                ]
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    scores = provider.rerank("a query", ["doc a", "doc b"])

    assert captured["url"] == OPENROUTER_RERANK_URL
    assert captured["headers"]["Authorization"] == "Bearer key"
    assert captured["json"] == {
        "model": "cohere/rerank-v3.5",
        "query": "a query",
        "documents": ["doc a", "doc b"],
    }
    assert scores == [0.2, 0.9]


def test_rerank_returns_empty_list_for_no_documents() -> None:
    provider = OpenRouterRerankProvider(model="cohere/rerank-v3.5", api_key="key")

    assert provider.rerank("a query", []) == []


def test_rerank_raises_on_non_200(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = OpenRouterRerankProvider(model="cohere/rerank-v3.5", api_key="key")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(500, text="boom"))

    with pytest.raises(OpenRouterRerankError, match="500"):
        provider.rerank("a query", ["doc a"])


def test_rerank_raises_when_response_missing_results(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = OpenRouterRerankProvider(model="cohere/rerank-v3.5", api_key="key")
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(200, json={"unexpected": "shape"})
    )

    with pytest.raises(OpenRouterRerankError, match="results"):
        provider.rerank("a query", ["doc a"])


def test_rerank_wraps_transport_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = OpenRouterRerankProvider(model="cohere/rerank-v3.5", api_key="key")

    def fake_post(*args: Any, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(OpenRouterRerankError, match="request failed"):
        provider.rerank("a query", ["doc a"])
