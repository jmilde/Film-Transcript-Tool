"""In-memory view of a transcript, ready for rendering to an export format.

The renderers (:mod:`app.export.markdown`, :mod:`app.export.srt`) are pure
functions over these dataclasses, with no database or ORM knowledge — the
service layer assembles the document (resolving edited-vs-original text, deleted
tokens, and speaker names) so the renderers stay trivially testable.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ExportToken:
    """One displayed word with its timing (edited text already resolved)."""

    text: str
    start_time: float
    end_time: float


@dataclass(frozen=True)
class ExportSegment:
    """A speaker's contiguous block of tokens.

    ``speaker`` is the display name (``None`` when the segment has no speaker).
    A segment always carries at least one token; empty segments are dropped when
    the document is built.
    """

    speaker: str | None
    tokens: list[ExportToken]

    @property
    def start_time(self) -> float:
        return self.tokens[0].start_time

    @property
    def end_time(self) -> float:
        return self.tokens[-1].end_time

    @property
    def text(self) -> str:
        return " ".join(token.text for token in self.tokens)


@dataclass(frozen=True)
class ExportDocument:
    """A whole transcript prepared for export."""

    video_name: str
    language: str | None
    segments: list[ExportSegment]
