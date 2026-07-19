import json
from pathlib import Path
from typing import Any

_FIXTURE = Path(__file__).parent / "fixtures" / "deepgram_sample.json"


def load_deepgram_sample() -> dict[str, Any]:
    """The saved Deepgram response fixture (diarized, two speakers, utterances).

    Shared by the ``normalize`` unit test and the transcribe-handler test so a
    live Deepgram call is never needed in the fast suite.
    """
    data: dict[str, Any] = json.loads(_FIXTURE.read_text())
    return data
