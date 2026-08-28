from typing import Protocol


class EmbeddingsProvider(Protocol):
    """Embeds a batch of texts into fixed-dimension vectors.

    Deliberately provider-agnostic (mirrors ``app.translation.base``), so
    swapping the embedding model/provider is a one-line change in
    ``app.embeddings.factory`` — no caller changes. The returned vectors'
    dimension must match ``Settings.embeddings_dimension`` (and the
    ``TranscriptChunk.embedding`` column's fixed dimension); changing models
    requires a migration plus a full re-embed, not just a config change.
    """

    def embed(self, texts: list[str]) -> list[list[float]]: ...
