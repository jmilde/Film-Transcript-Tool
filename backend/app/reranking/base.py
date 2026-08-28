from typing import Protocol


class RerankProvider(Protocol):
    """Scores a batch of documents against a query for relevance.

    Deliberately provider-agnostic (mirrors ``app.embeddings.base``). Returns
    one relevance score per document, positionally aligned with ``documents``
    (not sorted/reordered) — the caller decides how to rank/select.
    """

    def rerank(self, query: str, documents: list[str]) -> list[float]: ...
