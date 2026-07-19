from app.export.document import ExportDocument, ExportSegment, ExportToken
from app.export.markdown import render_markdown


def _document() -> ExportDocument:
    return ExportDocument(
        video_name="Interview Name",
        language="en",
        segments=[
            ExportSegment(
                speaker="John",
                tokens=[
                    ExportToken(text="I", start_time=12.0, end_time=12.5),
                    ExportToken(text="think", start_time=12.5, end_time=18.0),
                ],
            ),
            ExportSegment(
                speaker="John",
                tokens=[ExportToken(text="Next.", start_time=19.0, end_time=25.0)],
            ),
            ExportSegment(
                speaker="Mary",
                tokens=[ExportToken(text="Agreed.", start_time=3620.0, end_time=3625.0)],
            ),
        ],
    )


def test_render_markdown_exact() -> None:
    assert render_markdown(_document()) == (
        "# Interview Name\n\n"
        "_Language: en_\n\n"
        "## Speaker: John\n\n"
        "[00:00:12 - 00:00:18]\n\n"
        "I think\n\n"
        # Same speaker again: no repeated heading, just the next timed block.
        "[00:00:19 - 00:00:25]\n\n"
        "Next.\n\n"
        # Speaker change re-emits the heading; 3620s proves HH rolls past an hour.
        "## Speaker: Mary\n\n"
        "[01:00:20 - 01:00:25]\n\n"
        "Agreed.\n"
    )


def test_render_markdown_omits_language_when_absent() -> None:
    document = ExportDocument(
        video_name="Clip",
        language=None,
        segments=[
            ExportSegment(
                speaker=None,
                tokens=[ExportToken(text="Hi.", start_time=0.0, end_time=1.0)],
            )
        ],
    )
    assert render_markdown(document) == (
        "# Clip\n\n## Speaker: Unknown\n\n[00:00:00 - 00:00:01]\n\nHi.\n"
    )
