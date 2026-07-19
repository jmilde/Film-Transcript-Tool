"""Offline translation via Argos Translate.

Argos runs local neural models (no network at translation time, once a language
pair's package is installed), which keeps version 1 free and self-contained.
The package for a pair (e.g. ``es -> en``) is downloaded on first use when
``auto_install`` is set. Only the response is provider-specific; the normalized
transcript model never sees anything Argos-shaped — this class implements the
provider-agnostic :class:`app.translation.base.TranslationProvider` so it can be
swapped for a hosted API (DeepL) without touching callers.
"""

from typing import Any

import argostranslate.package
import argostranslate.translate


class ArgosTranslationError(RuntimeError):
    """An Argos translation failed or the requested language pair is unavailable."""


class ArgosTranslationProvider:
    """Translate text with locally-installed Argos models.

    Args:
        auto_install: when the requested pair is not installed, download and
            install its package on demand (needs network on that first call).
            Disable it to fail fast against only the already-installed models.
    """

    def __init__(self, *, auto_install: bool = True) -> None:
        self._auto_install = auto_install

    def translate(
        self, texts: list[str], *, source_language: str, target_language: str
    ) -> list[str]:
        translation = self._get_translation(source_language, target_language)
        if translation is None and self._auto_install:
            self._install_package(source_language, target_language)
            translation = self._get_translation(source_language, target_language)
        if translation is None:
            raise ArgosTranslationError(
                f"No installed Argos package for {source_language}->{target_language}"
            )
        try:
            return [str(translation.translate(text)) for text in texts]
        except ArgosTranslationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive, model-internal errors
            raise ArgosTranslationError(
                f"Argos translation {source_language}->{target_language} failed: {exc}"
            ) from exc

    def _get_translation(self, source_language: str, target_language: str) -> Any:
        """Return the Argos translation object for the pair, or ``None``."""
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((lang for lang in installed if lang.code == source_language), None)
        to_lang = next((lang for lang in installed if lang.code == target_language), None)
        if from_lang is None or to_lang is None:
            return None
        return from_lang.get_translation(to_lang)

    def _install_package(self, source_language: str, target_language: str) -> None:
        """Download and install the Argos package for the language pair."""
        try:
            argostranslate.package.update_package_index()
            available = argostranslate.package.get_available_packages()
        except Exception as exc:
            raise ArgosTranslationError(
                f"Could not fetch the Argos package index for "
                f"{source_language}->{target_language}: {exc}"
            ) from exc
        package = next(
            (
                candidate
                for candidate in available
                if candidate.from_code == source_language and candidate.to_code == target_language
            ),
            None,
        )
        if package is None:
            raise ArgosTranslationError(
                f"No Argos package available for {source_language}->{target_language}"
            )
        argostranslate.package.install_from_path(package.download())
