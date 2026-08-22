import json
import subprocess
from pathlib import Path

import pytest
from app.media.ffmpeg import (
    compute_peaks,
    extract_audio,
    extract_audio_args,
    generate_proxy,
    generate_thumbnail,
    generate_waveform,
    parse_probe,
    probe,
    probe_args,
    proxy_args,
    thumbnail_args,
    waveform_pcm_args,
)


@pytest.fixture
def sample_clip(tmp_path: Path) -> Path:
    """A 1-second 320x240 25fps clip with a 440Hz tone, made by ffmpeg itself."""
    out = tmp_path / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=320x240:rate=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-shortest",
            str(out),
        ],
        capture_output=True,
        check=True,
    )
    return out


# ----- pure argument builders -----------------------------------------------


def test_probe_args_shape() -> None:
    assert probe_args(Path("/in.mp4")) == [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "/in.mp4",
    ]


def test_proxy_args_shape() -> None:
    args = proxy_args(Path("/in.mp4"), Path("/out.mp4"), height=480)
    assert args[0] == "ffmpeg"
    assert args[-1] == "/out.mp4"
    assert "-i" in args and "/in.mp4" in args
    assert "libx264" in args
    assert "scale=-2:min(ih\\,480)" in args
    assert args[args.index("-movflags") + 1] == "+faststart"


def test_waveform_pcm_args_stream_to_stdout() -> None:
    args = waveform_pcm_args(Path("/in.mp4"), sample_rate=8000)
    assert args[0] == "ffmpeg"
    assert args[-1] == "pipe:1"
    assert args[args.index("-ar") + 1] == "8000"
    assert args[args.index("-f") + 1] == "s16le"
    assert args[args.index("-ac") + 1] == "1"


def test_thumbnail_args_shape() -> None:
    args = thumbnail_args(Path("/in.mp4"), Path("/out.jpg"), duration=100.0, width=240)
    assert args[0] == "ffmpeg"
    assert args[-1] == "/out.jpg"
    assert args[args.index("-ss") + 1] == "10.000"
    assert args[args.index("-i") + 1] == "/in.mp4"
    assert "-frames:v" in args and args[args.index("-frames:v") + 1] == "1"
    assert "scale=240:-2" in args


def test_thumbnail_args_clamps_negative_duration() -> None:
    args = thumbnail_args(Path("/in.mp4"), Path("/out.jpg"), duration=0.0)
    assert args[args.index("-ss") + 1] == "0.000"


def test_extract_audio_args_shape() -> None:
    args = extract_audio_args(Path("/in.mp4"), Path("/out.wav"), sample_rate=16000)
    assert args[0] == "ffmpeg"
    assert args[-1] == "/out.wav"
    assert "-vn" in args
    assert args[args.index("-ar") + 1] == "16000"
    assert args[args.index("-c:a") + 1] == "pcm_s16le"


# ----- pure parsing / peak computation --------------------------------------


def test_parse_probe_extracts_fields() -> None:
    raw = {
        "format": {"duration": "12.5"},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "avg_frame_rate": "30000/1001",
            },
            {"codec_type": "audio", "codec_name": "aac"},
        ],
    }
    result = parse_probe(raw)
    assert result.duration == 12.5
    assert result.width == 1920
    assert result.height == 1080
    assert result.frame_rate == pytest.approx(29.97, abs=0.01)
    assert result.video_codec == "h264"
    assert result.audio_codec == "aac"
    assert result.has_audio is True


def test_parse_probe_handles_missing_audio_and_bad_rate() -> None:
    raw = {
        "format": {},
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "avg_frame_rate": "0/0"},
        ],
    }
    result = parse_probe(raw)
    assert result.duration is None
    assert result.frame_rate is None
    assert result.has_audio is False
    assert result.audio_codec is None


def test_compute_peaks_normalizes_and_counts() -> None:
    # Two 16-bit samples: full-scale negative and zero -> one peak of 1.0.
    pcm = b"\x00\x80" + b"\x00\x00"
    assert compute_peaks(pcm, peak_count=1) == [1.0]


def test_compute_peaks_empty_pcm() -> None:
    assert compute_peaks(b"", peak_count=10) == []


# ----- real ffmpeg runs against a tiny clip ---------------------------------


def test_probe_real_clip(sample_clip: Path) -> None:
    result = probe(sample_clip)
    assert result.width == 320
    assert result.height == 240
    assert result.duration is not None and result.duration > 0
    assert result.frame_rate == pytest.approx(25.0, abs=0.1)
    assert result.has_audio is True


def test_generate_proxy_real_clip(sample_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "nested" / "proxy.mp4"
    generate_proxy(sample_clip, out, height=180)
    assert out.exists() and out.stat().st_size > 0
    # The proxy is itself valid, playable H.264 at the requested height.
    proxied = probe(out)
    assert proxied.video_codec == "h264"
    assert proxied.height == 180


def test_generate_waveform_real_clip(sample_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "wave.json"
    data = generate_waveform(sample_clip, out, sample_rate=8000, peak_count=100)
    assert len(data.peaks) == 100
    assert all(0.0 <= p <= 1.0 for p in data.peaks)
    assert max(data.peaks) > 0.0  # the 440Hz tone is not silent
    written = json.loads(out.read_text())
    assert written["version"] == 1
    assert written["sample_rate"] == 8000
    assert written["peaks"] == data.peaks


def test_generate_thumbnail_real_clip(sample_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "nested" / "thumb.jpg"
    generate_thumbnail(sample_clip, out, duration=1.0, width=160)
    assert out.exists() and out.stat().st_size > 0
    thumb = probe(out)
    assert thumb.width == 160


def test_extract_audio_real_clip(sample_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "audio.wav"
    extract_audio(sample_clip, out, sample_rate=16000)
    assert out.exists() and out.stat().st_size > 0
    extracted = probe(out)
    assert extracted.has_audio is True
    assert extracted.audio_codec == "pcm_s16le"
