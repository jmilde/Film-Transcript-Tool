from app.translation.argos import ArgosTranslationProvider
from app.translation.base import TranslationProvider


def get_translation_provider() -> TranslationProvider:
    """Build the configured translation provider.

    Version 1 uses offline Argos models. The return type is the provider-agnostic
    protocol, so switching to a hosted provider (e.g. DeepL) is a one-line change
    here — no caller or worker handler changes. Indirected through a factory (like
    ``app.transcription.factory``) so handlers can be tested with a fake provider.
    """
    return ArgosTranslationProvider()
