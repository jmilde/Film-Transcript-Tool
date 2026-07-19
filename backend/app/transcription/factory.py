from app.config import get_settings
from app.transcription.deepgram import DeepgramTranscriptionProvider


def get_transcription_provider() -> DeepgramTranscriptionProvider:
    """Build the configured transcription provider from settings.

    Indirected through a factory (like ``app.storage.factory``) so the worker
    handler can be tested against a fake provider without a live Deepgram call.
    """
    return DeepgramTranscriptionProvider(get_settings().deepgram_api_key)
