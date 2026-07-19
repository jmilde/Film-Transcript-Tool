"""Render an :class:`~app.export.document.ExportDocument` as SubRip (SRT).

One subtitle block per transcript segment (``docs/900_export.md`` §5): a 1-based
index, the ``HH:MM:SS,mmm --> HH:MM:SS,mmm`` timing derived from token
timestamps, and the segment text.
"""

from app.export.document import ExportDocument


def _timestamp(seconds: float) -> str:
    """Format seconds as ``HH:MM:SS,mmm`` (SRT millisecond precision)."""
    millis_total = int(round(seconds * 1000))
    hours, remainder = divmod(millis_total, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def render_srt(document: ExportDocument) -> str:
    blocks: list[str] = []
    for index, segment in enumerate(document.segments, start=1):
        start = _timestamp(segment.start_time)
        end = _timestamp(segment.end_time)
        blocks.append(f"{index}\n{start} --> {end}\n{segment.text}")
    if not blocks:
        return ""
    return "\n\n".join(blocks) + "\n"
