"""Render an :class:`~app.export.document.ExportDocument` as Markdown.

Layout follows ``docs/900_export.md`` §4.1: a title, the transcript language, and
per-segment ``## Speaker:`` headings (emitted only when the speaker changes) each
followed by ``[HH:MM:SS - HH:MM:SS]`` timing and the segment text.
"""

from app.export.document import ExportDocument


def _timestamp(seconds: float) -> str:
    """Format seconds as ``HH:MM:SS`` (Markdown uses whole-second precision)."""
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def render_markdown(document: ExportDocument) -> str:
    blocks: list[str] = [f"# {document.video_name}"]
    if document.language is not None:
        blocks.append(f"_Language: {document.language}_")

    previous_speaker: str | None = None
    for segment in document.segments:
        speaker = segment.speaker or "Unknown"
        # Repeat the speaker heading only when the speaker changes, so a run of
        # consecutive segments by one person reads as a single labelled block.
        if speaker != previous_speaker:
            blocks.append(f"## Speaker: {speaker}")
            previous_speaker = speaker
        blocks.append(f"[{_timestamp(segment.start_time)} - {_timestamp(segment.end_time)}]")
        blocks.append(segment.text)

    return "\n\n".join(blocks) + "\n"
