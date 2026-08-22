"""Typed wrappers around the ``ffmpeg``/``ffprobe`` command-line binaries.

Every operation is split into a pure argument-list builder (``*_args``) — which
constructs the exact command for given inputs and is trivially unit-testable
without touching a real binary — and a thin runner that invokes it via
``subprocess``. Long-running work only ever runs inside the worker, never in an
API request, so these are called from ``app.worker.handlers.*``.
"""

import array
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"

# Proxy playback target height (width is derived, kept even via ``-2``).
PROXY_HEIGHT = 720
# Waveform is computed from a low-rate mono PCM stream; the peaks are what the
# timeline renders, so a coarse sample rate and a fixed bucket count suffice.
WAVEFORM_SAMPLE_RATE = 8000
WAVEFORM_PEAKS = 1000
# Transcription audio: mono 16 kHz PCM WAV — small, lossless enough for ASR, and
# avoids sending the full video to the transcription provider.
AUDIO_SAMPLE_RATE = 16000
# Thumbnail target width (height derived, kept even via ``-2``).
THUMBNAIL_WIDTH = 480


class FFmpegError(RuntimeError):
    """An ``ffmpeg``/``ffprobe`` invocation exited non-zero."""


@dataclass(frozen=True)
class ProbeResult:
    duration: float | None
    width: int | None
    height: int | None
    frame_rate: float | None
    video_codec: str | None
    audio_codec: str | None
    has_audio: bool


@dataclass(frozen=True)
class WaveformData:
    version: int
    sample_rate: int
    peaks: list[float]


def _run(args: list[str]) -> bytes:
    """Run a command, returning stdout; raise :class:`FFmpegError` on failure."""
    completed = subprocess.run(args, capture_output=True)
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", "replace").strip()
        raise FFmpegError(f"{args[0]} exited {completed.returncode}: {stderr[-2000:]}")
    return completed.stdout


# ----- probe / metadata -----------------------------------------------------


def probe_args(input_path: Path) -> list[str]:
    return [
        FFPROBE,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(input_path),
    ]


def _parse_frame_rate(value: str) -> float | None:
    """Parse an ffprobe rational like ``"30000/1001"`` (or ``"0/0"``)."""
    if "/" in value:
        num_s, den_s = value.split("/", 1)
        try:
            num, den = float(num_s), float(den_s)
        except ValueError:
            return None
        return num / den if den else None
    try:
        return float(value)
    except ValueError:
        return None


def _first_stream(streams: list[dict[str, Any]], codec_type: str) -> dict[str, Any] | None:
    return next((s for s in streams if s.get("codec_type") == codec_type), None)


def parse_probe(raw: dict[str, Any]) -> ProbeResult:
    """Reduce raw ffprobe JSON to the fields we persist on the video."""
    streams: list[dict[str, Any]] = raw.get("streams", [])
    fmt: dict[str, Any] = raw.get("format", {})
    video = _first_stream(streams, "video")
    audio = _first_stream(streams, "audio")

    duration: float | None = None
    raw_duration = fmt.get("duration")
    if raw_duration is not None:
        try:
            duration = float(raw_duration)
        except (TypeError, ValueError):
            duration = None

    frame_rate: float | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    if video is not None:
        rate = video.get("avg_frame_rate") or video.get("r_frame_rate")
        if rate:
            frame_rate = _parse_frame_rate(str(rate))
        raw_w, raw_h = video.get("width"), video.get("height")
        width = int(raw_w) if raw_w is not None else None
        height = int(raw_h) if raw_h is not None else None
        video_codec = video.get("codec_name")

    return ProbeResult(
        duration=duration,
        width=width,
        height=height,
        frame_rate=frame_rate,
        video_codec=video_codec,
        audio_codec=audio.get("codec_name") if audio is not None else None,
        has_audio=audio is not None,
    )


def probe(input_path: Path) -> ProbeResult:
    raw: dict[str, Any] = json.loads(_run(probe_args(input_path)))
    return parse_probe(raw)


# ----- proxy ----------------------------------------------------------------


def proxy_args(input_path: Path, output_path: Path, height: int = PROXY_HEIGHT) -> list[str]:
    return [
        FFMPEG,
        "-y",
        "-i",
        str(input_path),
        # Downscale to at most ``height`` (never upscale a smaller source);
        # ``-2`` keeps width even, as H.264 requires. The comma is escaped so
        # ffmpeg reads one filter, not a two-filter graph.
        "-vf",
        f"scale=-2:min(ih\\,{height})",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        # Move the moov atom to the front for progressive browser playback.
        "-movflags",
        "+faststart",
        str(output_path),
    ]


def generate_proxy(input_path: Path, output_path: Path, height: int = PROXY_HEIGHT) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _run(proxy_args(input_path, output_path, height))


# ----- waveform -------------------------------------------------------------


def waveform_pcm_args(input_path: Path, sample_rate: int = WAVEFORM_SAMPLE_RATE) -> list[str]:
    """ffmpeg args that stream mono signed-16-bit little-endian PCM to stdout."""
    return [
        FFMPEG,
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "pipe:1",
    ]


def compute_peaks(pcm: bytes, peak_count: int = WAVEFORM_PEAKS) -> list[float]:
    """Downsample signed-16-bit PCM to ``peak_count`` normalized 0..1 peaks."""
    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) - (len(pcm) % samples.itemsize)])
    total = len(samples)
    if total == 0:
        return []
    count = min(peak_count, total)
    bucket = total / count
    peaks: list[float] = []
    for i in range(count):
        start = int(i * bucket)
        end = total if i == count - 1 else max(int((i + 1) * bucket), start + 1)
        peak = max(abs(s) for s in samples[start:end])
        peaks.append(round(peak / 32768.0, 4))
    return peaks


def generate_waveform(
    input_path: Path,
    output_path: Path,
    sample_rate: int = WAVEFORM_SAMPLE_RATE,
    peak_count: int = WAVEFORM_PEAKS,
) -> WaveformData:
    pcm = _run(waveform_pcm_args(input_path, sample_rate))
    data = WaveformData(version=1, sample_rate=sample_rate, peaks=compute_peaks(pcm, peak_count))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"version": data.version, "sample_rate": data.sample_rate, "peaks": data.peaks})
    )
    return data


# ----- audio extraction -----------------------------------------------------


def extract_audio_args(
    input_path: Path, output_path: Path, sample_rate: int = AUDIO_SAMPLE_RATE
) -> list[str]:
    return [
        FFMPEG,
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]


def extract_audio(
    input_path: Path, output_path: Path, sample_rate: int = AUDIO_SAMPLE_RATE
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _run(extract_audio_args(input_path, output_path, sample_rate))


# ----- thumbnail --------------------------------------------------------------


def thumbnail_args(
    input_path: Path, output_path: Path, duration: float, width: int = THUMBNAIL_WIDTH
) -> list[str]:
    # Seeking before -i is fast (keyframe-based); 10% in tends to skip
    # black/title frames without depending on the far end of the clip.
    timestamp = max(duration * 0.1, 0.0)
    return [
        FFMPEG,
        "-y",
        "-ss",
        f"{timestamp:.3f}",
        "-i",
        str(input_path),
        "-frames:v",
        "1",
        "-vf",
        f"scale={width}:-2",
        str(output_path),
    ]


def generate_thumbnail(
    input_path: Path, output_path: Path, duration: float, width: int = THUMBNAIL_WIDTH
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _run(thumbnail_args(input_path, output_path, duration, width))
