from app.models.job import JobType
from app.services.pipeline import FIRST_STAGE, UPLOAD_PIPELINE, next_stage


def test_first_stage_is_metadata() -> None:
    assert FIRST_STAGE is JobType.EXTRACT_METADATA
    assert UPLOAD_PIPELINE[0] is JobType.EXTRACT_METADATA


def test_stage_order() -> None:
    assert next_stage(JobType.EXTRACT_METADATA) is JobType.GENERATE_PROXY
    assert next_stage(JobType.GENERATE_PROXY) is JobType.GENERATE_WAVEFORM
    assert next_stage(JobType.GENERATE_WAVEFORM) is JobType.EXTRACT_AUDIO
    assert next_stage(JobType.EXTRACT_AUDIO) is JobType.TRANSCRIBE


def test_final_stage_has_no_next() -> None:
    assert next_stage(JobType.TRANSCRIBE) is None


def test_non_pipeline_stage_has_no_next() -> None:
    assert next_stage(JobType.TRANSLATE) is None
    assert next_stage(JobType.EXPORT) is None
    assert next_stage(JobType.NOOP) is None
