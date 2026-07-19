"""Pure Deepgram-response → provider-agnostic transcript normalization.

Deepgram's prerecorded response (with ``diarize``, ``utterances``,
``punctuate``, ``smart_format``) is reduced here to the small, typed shape the
rest of the app builds transcripts from. Nothing in this module touches the
database or the network, so it is tested against a saved response fixture.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class NormalizedWord:
    text: str
    start: float
    end: float
    confidence: float | None


@dataclass(frozen=True)
class NormalizedSegment:
    # Provider speaker identifier (e.g. ``speaker_0``), or ``None`` if the
    # provider gave no diarization for this block.
    speaker: str | None
    words: list[NormalizedWord]


@dataclass(frozen=True)
class NormalizedTranscript:
    language: str | None
    segments: list[NormalizedSegment]


def _speaker_label(index: Any) -> str | None:
    if index is None:
        return None
    try:
        return f"speaker_{int(index)}"
    except (TypeError, ValueError):
        return None


def _word(raw: dict[str, Any]) -> NormalizedWord:
    # ``smart_format``/``punctuate`` put the display form in ``punctuated_word``;
    # fall back to the raw ``word`` when it is absent.
    text = str(raw.get("punctuated_word") or raw.get("word") or "")
    start = float(raw.get("start", 0.0))
    end = float(raw.get("end", start))
    confidence = raw.get("confidence")
    return NormalizedWord(
        text=text,
        start=start,
        end=end,
        confidence=float(confidence) if confidence is not None else None,
    )


def _detect_language(results: dict[str, Any]) -> str | None:
    channels: list[dict[str, Any]] = results.get("channels", [])
    if channels:
        language = channels[0].get("detected_language")
        if isinstance(language, str):
            return language
    return None


def _channel_words(results: dict[str, Any]) -> list[dict[str, Any]]:
    channels: list[dict[str, Any]] = results.get("channels", [])
    if not channels:
        return []
    alternatives: list[dict[str, Any]] = channels[0].get("alternatives", [])
    if not alternatives:
        return []
    words: list[dict[str, Any]] = alternatives[0].get("words", [])
    return words


def _group_by_speaker(raw_words: list[dict[str, Any]]) -> list[NormalizedSegment]:
    """Fallback segmentation: split the flat word list on speaker changes."""
    segments: list[NormalizedSegment] = []
    current: list[NormalizedWord] = []
    current_speaker: str | None = None
    for raw in raw_words:
        label = _speaker_label(raw.get("speaker"))
        if current and label != current_speaker:
            segments.append(NormalizedSegment(speaker=current_speaker, words=current))
            current = []
        current_speaker = label
        current.append(_word(raw))
    if current:
        segments.append(NormalizedSegment(speaker=current_speaker, words=current))
    return segments


def normalize(raw: dict[str, Any]) -> NormalizedTranscript:
    """Reduce a raw Deepgram response to the normalized transcript model.

    Prefers Deepgram ``utterances`` (each utterance is one speaker's continuous
    block → one segment); falls back to grouping the flat word list by speaker
    when utterances are absent.
    """
    results: dict[str, Any] = raw.get("results", {})
    language = _detect_language(results)

    utterances: list[dict[str, Any]] = results.get("utterances") or []
    if utterances:
        segments = [
            NormalizedSegment(
                speaker=_speaker_label(utterance.get("speaker")),
                words=[_word(w) for w in utterance.get("words", [])],
            )
            for utterance in utterances
        ]
    else:
        segments = _group_by_speaker(_channel_words(results))

    segments = [segment for segment in segments if segment.words]
    return NormalizedTranscript(language=language, segments=segments)
