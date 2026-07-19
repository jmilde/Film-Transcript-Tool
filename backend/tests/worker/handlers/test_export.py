import pytest
from app.models.export import Export, ExportType
from app.models.job import JobStatus, JobType, ProcessingJob
from app.services.exports import export_key
from app.services.transcripts import create_transcript_from_normalized
from app.transcription.normalize import normalize
from app.worker.handlers.export import handle_export
from app.worker.runner import run_once

from tests.transcription.deepgram_fixture import load_deepgram_sample
from tests.worker.handlers.conftest import MediaFixture


def _seed_export(media: MediaFixture, export_type: ExportType) -> tuple[Export, ProcessingJob]:
    raw = load_deepgram_sample()
    transcript = create_transcript_from_normalized(
        media.db, media.video, normalize(raw), raw, created_by=media.video.created_by
    )
    media.db.flush()
    export = Export(
        transcript_id=transcript.id,
        project_id=media.video.project_id,
        type=export_type,
        created_by=media.video.created_by,
    )
    media.db.add(export)
    media.db.flush()
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.EXPORT,
        status=JobStatus.PENDING,
        result={"export_id": str(export.id)},
    )
    media.db.add(job)
    media.db.flush()
    return export, job


def test_handle_export_writes_markdown(media: MediaFixture) -> None:
    export, job = _seed_export(media, ExportType.MARKDOWN)

    result = handle_export(media.db, job)

    assert result is not None
    key = export_key(export.id, ExportType.MARKDOWN)
    assert result == {"export_id": str(export.id), "storage_path": key}
    # The row now points at the rendered file, which really exists in storage.
    assert export.storage_path == key
    content = media.storage.path_for(key).read_text()
    assert content.startswith("# clip\n\n_Language: en_\n\n## Speaker: speaker_0\n\n")
    assert "Hello there." in content


def test_handle_export_writes_srt(media: MediaFixture) -> None:
    export, job = _seed_export(media, ExportType.SRT)

    handle_export(media.db, job)

    assert export.storage_path is not None
    content = media.storage.path_for(export.storage_path).read_text()
    assert content == (
        "1\n00:00:00,000 --> 00:00:00,800\nHello there.\n\n"
        "2\n00:00:01,200 --> 00:00:01,900\nHow are you?\n"
    )


def test_run_once_drives_export_to_completion(media: MediaFixture) -> None:
    export, _ = _seed_export(media, ExportType.MARKDOWN)
    media.db.commit()

    processed = run_once(media.db)

    assert processed is not None
    assert processed.type is JobType.EXPORT
    assert processed.status is JobStatus.COMPLETED
    assert processed.result == {
        "export_id": str(export.id),
        "storage_path": export_key(export.id, ExportType.MARKDOWN),
    }


def test_handle_export_missing_export_id(media: MediaFixture) -> None:
    job = ProcessingJob(
        video_id=media.video.id,
        project_id=media.video.project_id,
        type=JobType.EXPORT,
        status=JobStatus.PENDING,
        result=None,
    )
    media.db.add(job)
    media.db.flush()

    with pytest.raises(RuntimeError, match="export_id"):
        handle_export(media.db, job)
