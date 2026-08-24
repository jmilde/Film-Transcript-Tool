"""Reranking via OpenRouter's rerank endpoint.

PydanticAI has no rerank abstraction, so this is our own thin ``httpx``
client — the request/response shape mirrors Cohere's rerank API (the v1
default model is ``cohere/rerank-v3.5``), which OpenRouter's ``/rerank``
endpoint proxies.
"""

from typing import Any

import httpx

OPENROUTER_RERANK_URL = "https://openrouter.ai/api/v1/rerank"
REQUEST_TIMEOUT = 30.0


class OpenRouterRerankError(RuntimeError):
    """An OpenRouter rerank call failed or returned a non-200 status."""


class OpenRouterRerankProvider:
    """Rerank documents against a query via an OpenRouter-hosted reranker."""

    def __init__(self, *, model: str, api_key: str, timeout: float = REQUEST_TIMEOUT) -> None:
        self._model = model
        self._api_key = api_key
        self._timeout = timeout

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        if not documents:
            return []

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self._model, "query": query, "documents": documents}
        try:
            response = httpx.post(
                OPENROUTER_RERANK_URL, headers=headers, json=payload, timeout=self._timeout
            )
        except httpx.HTTPError as exc:
            raise OpenRouterRerankError(f"OpenRouter rerank request failed: {exc}") from exc
        if response.status_code != 200:
            raise OpenRouterRerankError(
                f"OpenRouter rerank returned {response.status_code}: {response.text[:500]}"
            )

        body: dict[str, Any] = response.json()
        results = body.get("results")
        if not isinstance(results, list):
            raise OpenRouterRerankError(f"OpenRouter rerank response missing 'results': {body!r}")

        scores = [0.0] * len(documents)
        for result in results:
            index = result["index"]
            scores[index] = float(result["relevance_score"])
        return scores
