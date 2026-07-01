# Product Specification
---

# Purpose

The Film Transcript Tool is a local-first transcript management application designed for documentary filmmakers.

It enables teams to upload footage, generate transcripts with speaker diarization, review and correct transcripts, collaborate through comments, organize media, search interview content, and export transcripts for editorial workflows.

The application complements video editing software such as DaVinci Resolve rather than replacing it.

---

# Design Principles

The application should be:

- Local-first
- Non-destructive
- Fast
- Collaborative
- Easy to self-host
- Cloud-ready
- Transcript-first
- Media-aware

---

# Core Workflow

A user should be able to:

1. Create a project.
2. Create nested folders.
3. Upload one or more videos.
4. Wait while videos are processed.
5. Review transcripts.
6. Rename speakers.
7. Correct transcript mistakes.
8. Leave comments.
9. Search transcripts.
10. Export transcripts.

---

# Supported Media

## Input

- MP4
- MOV

## Generated Assets

Each uploaded video generates:

- Original video
- Proxy video
- Audio waveform
- Transcript(s)

---

# Project Structure

Projects contain nested folders.

Folders contain:

- Videos
- Other folders

There is no nesting limit.

---

# Video Processing

Every uploaded video runs the following pipeline:

1. Store original media.
2. Generate proxy.
3. Generate waveform.
4. Transcribe using Deepgram.
5. Detect speakers.
6. Store transcript.
7. Optionally translate transcript.

The UI displays the current processing status.

---

# Proxy Video

The application generates a high-quality H.264 MP4 proxy suitable for reviewing:

- focus
- framing
- facial expressions

Playback always uses the proxy.

The original media is never modified.

---

# Transcript

A transcript belongs to exactly one video and one language.

Examples:

- English
- German
- French

Each transcript is edited independently.

Retriggering translation replaces or versions only the translated transcript.

---

# Speaker Mapping

Speakers belong to the video rather than the transcript.

Deepgram speaker identifiers are mapped to user-defined names.

Example:

Speaker 0 → John

Speaker 1 → Sarah

Every transcript automatically uses the same speaker mapping.

---

# Transcript Viewer

The interface consists of two synchronized panes.

Left:

Transcript.

Right:

Video player.

Users may:

- play/pause video
- seek by clicking transcript
- enable/disable auto-follow
- select transcript ranges
- play selected ranges

---

# Dual Transcript View

The user may display two transcripts simultaneously.

Example:

Original language

German translation

Both remain synchronized with video playback.

Editing one transcript never changes another.

---

# Transcript Editing

Editing is non-destructive.

Supported operations:

- Replace token text
- Delete token
- Merge tokens
- Split tokens

Every visible token always has valid timestamps.

---

# Comments

Users may select transcript ranges.

Selected ranges support:

- comments
- replies
- resolved status

Every comment displays:

- author
- created date
- in timecode
- out timecode

---

# Search

Search supports:

- transcript text
- speaker names
- comments

Selecting a search result seeks the corresponding video position.

---

# Export

Supported formats:

- Markdown
- SRT

Exports preserve transcript timestamps.

---

# Authentication

Authentication is handled through Supabase.

Projects support multiple users.

Editable content records:

- created by
- created at
- updated by
- updated at

---

# Version 1 Excludes

The following are intentionally excluded:

- AI features
- Semantic search
- DaVinci Resolve integration
- Cloud deployment
- Automatic summaries
- Topic extraction
