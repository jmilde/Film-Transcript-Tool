# Processing Pipeline Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines the processing workflow for uploaded videos.

The processing pipeline prepares uploaded media for transcript review.

The pipeline handles:

- media preparation
- proxy generation
- waveform generation
- transcription
- speaker diarization
- translation

---

# 2. Pipeline Principles

## Asynchronous Processing

Video processing MUST NOT block API requests.

All long-running tasks run through background workers.

---

## Independent Steps

Each processing step SHOULD be independently executable.

A failure in one step MUST NOT require restarting completed steps.

Example:

```
Upload

DONE

Proxy generation

DONE

Transcription

FAILED

Translation

NOT STARTED
```

The user should only need to retry transcription.

---

## Observable State

Users MUST be able to see processing progress.

Each step has:

- status
- progress
- error information

---

# 3. Upload Pipeline

The upload workflow begins when a user uploads a supported video file.

Supported formats:

- MP4
- MOV

---

# 4. Upload Steps

## Step 1: Store Original Media

The uploaded file is stored as the original asset.

The original file:

- MUST NOT be modified
- MUST remain available
- MUST be used for future exports or integrations

---

## Step 2: Extract Media Metadata

The application extracts:

- duration
- resolution
- frame rate
- codec information
- audio information

This information is stored with the video.

---

## Step 3: Generate Proxy

A playback proxy is generated.

The proxy should:

- be smaller than the original
- maintain visual quality
- support smooth browser playback

The proxy is used for:

- transcript review
- searching
- comments
- playback

---

## Step 4: Generate Waveform

The application generates waveform data.

The waveform supports:

- visual timeline display
- future navigation features

---

## Step 5: Extract Audio

The application extracts the audio track from the video into a separate audio file.

The extracted audio:

- is used for transcription instead of the full video file
- avoids uploading large video files to the transcription provider

---

# 5. Transcription Pipeline

After media preparation:

The extracted audio is sent to Deepgram.

Deepgram provides:

- transcript text
- word timestamps
- speaker diarization
- confidence values

---

# 6. Deepgram Processing

The application MUST store the original provider response.

Provider responses SHOULD be stored separately from the normalized transcript model.

Reason:

- debugging
- provider changes
- future reprocessing

---

# 7. Transcript Creation

Deepgram output is transformed into the internal transcript model.

Conversion:

```
Deepgram response

		|

		v

Transcript

		|

		v

Segments

		|

		v

Tokens
```

The application MUST NOT expose provider-specific structures to the frontend.

---

# 8. Speaker Processing

Deepgram speaker identifiers are converted into application speakers.

Example:

Provider:

```
speaker_0
speaker_1
```

Application:

```
John

Sarah
```

Users may rename speakers after processing.

---

# 9. Translation Pipeline

Translation is optional.

A user may request translation after transcription.

Translation:

- creates a new transcript
- does not modify the original
- can be regenerated independently

---

# 10. Processing Jobs

Each processing action creates a job.

Examples:

```
Generate Proxy

Transcription

Translation

Export
```

A job contains:

- type
- status
- progress
- error information
- timestamps

---

# 11. Job States

Jobs move through:

```
Pending

↓

Running

↓

Completed
```

or:

```
Running

↓

Failed
```

---

# 12. Retry Behaviour

Failed jobs MUST be retryable.

Retrying a job SHOULD:

- reuse completed previous steps
- avoid unnecessary processing

Example:

Failed transcription:

```
Proxy

DONE

Waveform

DONE

Transcription

RETRY
```

---

# 13. Worker Responsibilities

Workers execute:

- FFmpeg operations
- API calls
- data processing
- exports

Workers update job status throughout execution.

---

# 14. Error Handling

Errors MUST include:

- failed step
- error message
- timestamp

Errors SHOULD include enough information for debugging.

---

# 15. Future Extensions

The pipeline should allow adding:

- alternative transcription providers
- local transcription models
- AI processing
- additional export formats
- automatic analysis
