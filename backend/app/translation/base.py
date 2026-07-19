from typing import Protocol


class TranslationProvider(Protocol):
    """Translates text from one language to another.

    Deliberately provider-agnostic: a batch of source strings in, the same
    number of translated strings out, for one ``source -> target`` language
    pair. Argos (offline models) and DeepL (a hosted API) both satisfy this,
    so swapping providers is a one-line change in ``app.translation.factory``.
    Language codes are ISO 639-1 lowercase (e.g. ``es``, ``en``).
    """

    def translate(
        self, texts: list[str], *, source_language: str, target_language: str
    ) -> list[str]: ...
