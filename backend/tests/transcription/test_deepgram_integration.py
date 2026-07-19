"""Live Deepgram integration test.

Drives the real ``DeepgramTranscriptionProvider`` against a tiny checked-in
speech clip and runs the response through ``normalize``, so a provider change or
a broken request would be caught here rather than only in production. It hits the
network and needs a real key, so it is marked ``integration`` (deselect with
``-m 'not integration'``) and skips when no key is configured.
"""

from pathlib import Path

import pytest
from app.config import get_settings
from app.transcription.deepgram import DeepgramTranscriptionProvider
from app.transcription.normalize import normalize

_SNIPPET = Path(__file__).parent / "fixtures" / "snippet.wav"
_KEY = get_settings().deepgram_api_key

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        _KEY in ("", "placeholder"),
        reason="DEEPGRAM_API_KEY not configured (real key required for the live call)",
    ),
]


def test_deepgram_transcribes_snippet() -> None:
    provider = DeepgramTranscriptionProvider(_KEY)

    raw = provider.transcribe(_SNIPPET)
    # Raw shape stays what normalize() depends on — guards our saved fixture.
    assert "results" in raw
    assert raw["results"]["channels"][0]["alternatives"]

    result = normalize(raw)

    assert result.language == "en"
    assert result.segments, "expected at least one segment"
    words = [w for segment in result.segments for w in segment.words]
    assert words, "expected at least one word"
    assert all(w.text for w in words)
    assert all(w.start <= w.end for w in words)

    text = " ".join(w.text for w in words).lower()
    # The snippet says "Hello there, this is a transcription test."
    assert "hello" in text
    assert "transcription" in text
