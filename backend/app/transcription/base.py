from pathlib import Path
from typing import Any, Protocol


class TranscriptionProvider(Protocol):
    """Turns an audio file into raw, provider-specific JSON.

    Normalization into the provider-agnostic transcript model is a separate,
    pure step (``app.transcription.normalize``), so provider response shapes
    never leak past this boundary into the transcript model or the frontend.
    """

    def transcribe(self, audio_path: Path) -> dict[str, Any]: ...
