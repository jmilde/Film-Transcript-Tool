from app.models.job import JobType

# The ordered media-preparation stages triggered by a video upload. Each stage
# runs as its own job so a failure only requires retrying that stage, and later
# phases enqueue the next stage when one completes.
UPLOAD_PIPELINE: list[JobType] = [
    JobType.EXTRACT_METADATA,
    JobType.GENERATE_PROXY,
    JobType.GENERATE_THUMBNAIL,
    JobType.GENERATE_WAVEFORM,
    JobType.EXTRACT_AUDIO,
    JobType.TRANSCRIBE,
]

FIRST_STAGE: JobType = UPLOAD_PIPELINE[0]


def next_stage(stage: JobType) -> JobType | None:
    """The stage that follows ``stage`` in the upload pipeline, or ``None``.

    Returns ``None`` for the final stage or for any job type not part of the
    ordered upload pipeline (e.g. translate/export).
    """
    if stage not in UPLOAD_PIPELINE:
        return None
    index = UPLOAD_PIPELINE.index(stage)
    if index + 1 >= len(UPLOAD_PIPELINE):
        return None
    return UPLOAD_PIPELINE[index + 1]
