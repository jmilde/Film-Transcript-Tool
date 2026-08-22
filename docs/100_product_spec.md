# Product Specification

**Project:** Film Transcript Tool
---

# 1. Purpose

Film Transcript Tool is a local-first application for organizing, reviewing, editing and exporting video transcripts.

The application is intended for documentary filmmakers and research-heavy productions where many hours of footage must be reviewed before editing.

The application is transcript-centric. It is not intended to replace professional video editing software such as DaVinci Resolve.

---

# 2. Objectives

The application MUST allow users to:

- Organize videos into projects.
- Organize projects using nested folders.
- Upload video files.
- Automatically generate transcripts.
- Automatically detect speakers.
- Rename detected speakers.
- Edit transcripts.
- Search transcripts.
- Leave comments on transcript ranges.
- Export transcripts.
- Collaborate with multiple users.

The application SHOULD remain responsive while processing media.

The application MUST preserve original media files.

---

# 3. Projects

Projects are the highest level organizational unit.

A project contains:

- folders
- videos
- users

Projects MUST support:

- creation
- renaming
- archiving
- deletion

Projects MAY contain unlimited videos.

---

# 4. Folder Organization

Folders exist within a project.

Folders MAY contain:

- videos
- other folders

Folder nesting is unlimited.

Users MUST be able to:

- create folders
- rename folders
- move folders
- delete folders

Moving a folder MUST also move all child folders and videos.

---

# 5. Video Management

Version 1 supports:

- MP4
- MOV

Uploading a video creates a new video entry within the selected folder.

Each uploaded video MUST retain its original file.

The application MUST generate a proxy video for playback.

The proxy MUST preserve sufficient visual quality to evaluate:

- focus
- framing
- facial expressions
- scene content

The application MUST use the proxy during playback.

---

# 6. Video Processing

Video processing occurs asynchronously.

Processing consists of:

1. Store original media.
2. Generate proxy video.
3. Generate waveform.
4. Request transcription.
5. Detect speakers.
6. Store transcript.
7. Optionally generate translated transcripts.

Each processing stage MUST expose its current status.

Processing failures MUST report meaningful error messages.

Users MUST be able to retry failed processing jobs.

---

# 7. Speakers

Speaker diarization is provided by Deepgram.

Speakers belong to the video rather than individual transcripts.

Users MUST be able to rename speakers.

Renaming a speaker MUST update every transcript belonging to the same video.

---

# 8. Transcripts

Each transcript belongs to:

- one video
- one language

A video MAY contain multiple transcripts.

Each transcript is edited independently.

Editing one transcript MUST NOT modify another transcript.

The original transcription language MUST be preserved.

---

# 9. Transcript Viewer

The application displays a synchronized transcript and video player.

The transcript and video remain synchronized during playback.

Playback MUST highlight the active transcript token.

Users MUST be able to:

- play and pause video
- seek by clicking transcript
- enable or disable automatic transcript following
- select transcript ranges
- play selected transcript ranges

The transcript and video panels SHOULD be resizable.

---

# 10. Transcript Editing

Transcript editing is non-destructive.

The application uses editable tokens as the smallest editable unit.

Initially every token corresponds to a single word returned by the transcription provider.

Users MUST be able to:

- edit token text
- delete tokens
- merge multiple tokens
- split tokens

Every visible token MUST always have:

- text
- start timestamp
- end timestamp

Editing within a single token updates that token.

Editing across multiple tokens creates replacement tokens while preserving the timing of the selected range.

Deleted tokens MUST NOT appear in the transcript.

---

# 11. Translation

Users MAY generate translated transcripts.

Each translation is stored independently.

Translated transcripts MAY be regenerated at any time.

Regenerating a translation MUST NOT modify the original transcript.

Editing a translated transcript MUST NOT modify the source transcript.

---

# 12. Comments

Users MAY select one or more transcript tokens.

Selected ranges MAY receive comments.

Comments support:

- replies
- resolution

Each comment MUST display:

- author
- creation date
- in timecode
- out timecode

Comments remain attached to the selected transcript range.

---

# 13. Search

Users MUST be able to search:

- transcript text
- speaker names
- comments

Selecting a search result MUST seek the associated video position.

---

# 14. Export

Version 1 supports:

- Markdown
- SRT

Exports MUST preserve transcript timing.

Exports MUST reflect the edited transcript.

---

# 15. Authentication

Authentication is provided by Supabase.

Projects support multiple users. Each member holds one role on a project:
`owner`, `editor`, or `viewer`. `owner` and `editor` MAY create, edit, and
delete content; `viewer` MAY only read. Only an `owner` MAY invite members,
change a member's role, or remove a member. A project MUST always retain at
least one `owner`. Any member MAY remove themselves (leave a project).

Inviting a member by email REQUIRES that the invitee has already signed in
at least once; inviting an unknown email MUST fail with a message telling
the inviter the person needs to sign in first. Version 1 has no
pending-invite or email-notification system.

Editable objects MUST record:

- created by
- created at
- updated by
- updated at

---

# 16. Out of Scope

The following features are intentionally excluded from Version 1:

- AI-assisted search
- Semantic search
- Automatic summarization
- Topic extraction
- DaVinci Resolve integration
- Cloud deployment
- Mobile applications
