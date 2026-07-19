from typing import Any

from app.transcription.normalize import normalize

from tests.transcription.deepgram_fixture import load_deepgram_sample


def test_normalize_uses_utterances_for_segmentation() -> None:
    result = normalize(load_deepgram_sample())

    assert result.language == "en"
    assert len(result.segments) == 2

    first, second = result.segments
    assert first.speaker == "speaker_0"
    assert [w.text for w in first.words] == ["Hello", "there."]
    assert first.words[0].start == 0.0
    assert first.words[1].end == 0.8
    assert first.words[0].confidence == 0.999

    assert second.speaker == "speaker_1"
    assert [w.text for w in second.words] == ["How", "are", "you?"]


def test_normalize_falls_back_to_word_grouping_without_utterances() -> None:
    raw = load_deepgram_sample()
    # Drop utterances so the flat word list (channels[0]) drives segmentation.
    del raw["results"]["utterances"]

    result = normalize(raw)

    assert len(result.segments) == 2
    assert result.segments[0].speaker == "speaker_0"
    assert [w.text for w in result.segments[0].words] == ["Hello", "there."]
    assert result.segments[1].speaker == "speaker_1"
    assert [w.text for w in result.segments[1].words] == ["How", "are", "you?"]


def test_normalize_prefers_punctuated_word() -> None:
    result = normalize(load_deepgram_sample())
    # "there." carries the trailing period from punctuated_word, not "there".
    assert result.segments[0].words[1].text == "there."


def test_normalize_handles_empty_results() -> None:
    empty: dict[str, Any] = {"results": {}}
    result = normalize(empty)
    assert result.language is None
    assert result.segments == []
