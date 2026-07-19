from app.export.document import ExportDocument, ExportSegment, ExportToken
from app.export.srt import render_srt


def test_render_srt_exact() -> None:
    document = ExportDocument(
        video_name="Clip",
        language="en",
        segments=[
            ExportSegment(
                speaker="John",
                tokens=[
                    ExportToken(text="I", start_time=12.0, end_time=12.25),
                    ExportToken(text="think.", start_time=12.25, end_time=15.5),
                ],
            ),
            ExportSegment(
                speaker="Mary",
                tokens=[ExportToken(text="Next.", start_time=15.5, end_time=18.0)],
            ),
        ],
    )
    # Milliseconds come straight from the token timestamps (,000 / ,250 / ,500).
    assert render_srt(document) == (
        "1\n00:00:12,000 --> 00:00:15,500\nI think.\n\n2\n00:00:15,500 --> 00:00:18,000\nNext.\n"
    )


def test_render_srt_empty_document() -> None:
    assert render_srt(ExportDocument(video_name="Clip", language="en", segments=[])) == ""
