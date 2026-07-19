from typing import Any

import argostranslate.translate
import pytest
from app.translation.argos import ArgosTranslationError, ArgosTranslationProvider


class _FakeTranslation:
    def translate(self, text: str) -> str:
        return text.upper()


def test_translate_maps_over_texts(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ArgosTranslationProvider(auto_install=False)
    monkeypatch.setattr(provider, "_get_translation", lambda src, tgt: _FakeTranslation())

    result = provider.translate(["hola", "adios"], source_language="es", target_language="en")

    assert result == ["HOLA", "ADIOS"]


def test_translate_raises_when_pair_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    # No installed languages and auto-install disabled -> a clear, typed error
    # rather than a network download attempt.
    monkeypatch.setattr(argostranslate.translate, "get_installed_languages", lambda: [])
    provider = ArgosTranslationProvider(auto_install=False)

    with pytest.raises(ArgosTranslationError, match="es->en"):
        provider.translate(["hola"], source_language="es", target_language="en")


def test_translate_wraps_underlying_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Boom:
        def translate(self, text: str) -> str:
            raise ValueError("model exploded")

    provider = ArgosTranslationProvider(auto_install=False)
    monkeypatch.setattr(provider, "_get_translation", lambda src, tgt: _Boom())

    with pytest.raises(ArgosTranslationError):
        provider.translate(["hola"], source_language="es", target_language="en")


@pytest.mark.integration
def test_argos_translates_spanish_to_english_for_real() -> None:
    """Live end-to-end Argos translation (downloads the es->en model on first run)."""
    provider = ArgosTranslationProvider()

    try:
        result = provider.translate(
            ["Hola, ¿cómo estás?"], source_language="es", target_language="en"
        )
    except ArgosTranslationError as exc:
        pytest.skip(f"Argos es->en model unavailable (needs network): {exc}")

    assert len(result) == 1
    english = result[0].lower()
    # A faithful translation of the greeting mentions "how are you".
    assert "how" in english and "you" in english


def test_get_translation_returns_none_when_language_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Lang:
        def __init__(self, code: str) -> None:
            self.code = code

        def get_translation(self, other: Any) -> object:
            return object()

    # Only Spanish installed -> no es->en translation object available.
    monkeypatch.setattr(argostranslate.translate, "get_installed_languages", lambda: [_Lang("es")])
    provider = ArgosTranslationProvider(auto_install=False)

    assert provider._get_translation("es", "en") is None
