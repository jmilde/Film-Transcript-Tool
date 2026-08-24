from collections.abc import Sequence
from dataclasses import dataclass

import pytest
from app.embeddings.openrouter import OPENROUTER_BASE_URL, OpenRouterEmbeddingsProvider


@dataclass
class _FakeResult:
    embeddings: Sequence[Sequence[float]]


def test_embed_sends_all_texts_and_returns_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = OpenRouterEmbeddingsProvider(model="openai/text-embedding-3-small", api_key="key")
    captured: dict[str, object] = {}

    def fake_embed_documents_sync(
        texts: Sequence[str], *, settings: object | None = None
    ) -> _FakeResult:
        captured["texts"] = list(texts)
        return _FakeResult(embeddings=[[0.1, 0.2, 0.3] for _ in texts])

    monkeypatch.setattr(provider._embedder, "embed_documents_sync", fake_embed_documents_sync)

    result = provider.embed(["hello", "world"])

    assert captured["texts"] == ["hello", "world"]
    assert result == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]


def test_provider_targets_openrouter_base_url() -> None:
    provider = OpenRouterEmbeddingsProvider(model="openai/text-embedding-3-small", api_key="key")

    assert provider._embedder.model.base_url.startswith(OPENROUTER_BASE_URL)  # type: ignore[union-attr]
