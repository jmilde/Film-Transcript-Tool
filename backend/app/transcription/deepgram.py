from pathlib import Path
from typing import Any

import httpx

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
DEFAULT_MODEL = "nova-2"
# Diarization, word timestamps, utterance segmentation, and smart formatting are
# all required by the transcript model; language is auto-detected.
BASE_PARAMS: dict[str, str] = {
    "diarize": "true",
    "punctuate": "true",
    "utterances": "true",
    "smart_format": "true",
    "detect_language": "true",
}
# Transcription of a full clip can take a while; allow a generous timeout.
REQUEST_TIMEOUT = 600.0


class DeepgramError(RuntimeError):
    """A Deepgram API call failed or returned a non-200 status."""


class DeepgramTranscriptionProvider:
    """Real Deepgram prerecorded-audio transcription over REST.

    Sends the (small, mono 16 kHz) extracted audio rather than the full video,
    and returns the raw response dict; normalization happens separately in
    :func:`app.transcription.normalize.normalize`.
    """

    def __init__(
        self,
        api_key: str,
        *,
        model: str = DEFAULT_MODEL,
        timeout: float = REQUEST_TIMEOUT,
    ) -> None:
        self._api_key = api_key
        self._params = {**BASE_PARAMS, "model": model}
        self._timeout = timeout

    def transcribe(self, audio_path: Path) -> dict[str, Any]:
        headers = {
            "Authorization": f"Token {self._api_key}",
            "Content-Type": "audio/wav",
        }
        audio = audio_path.read_bytes()
        try:
            response = httpx.post(
                DEEPGRAM_URL,
                params=self._params,
                headers=headers,
                content=audio,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise DeepgramError(f"Deepgram request failed: {exc}") from exc
        if response.status_code != 200:
            raise DeepgramError(f"Deepgram returned {response.status_code}: {response.text[:500]}")
        result: dict[str, Any] = response.json()
        return result
