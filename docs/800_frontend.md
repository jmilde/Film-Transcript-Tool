# Frontend Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines the frontend structure and user interface behavior of Film Transcript Tool.

The frontend is responsible for:

- displaying projects and media
- transcript review
- video playback
- transcript editing
- comments
- search
- exports

---

# 2. Technology

The frontend uses:

- React
- TypeScript
- Vite
- TailwindCSS

Recommended supporting libraries:

- TanStack Query for server state
- React Router for navigation
- A typed API client
- A video playback abstraction

---

# 3. Frontend Principles

## Typed

All application data models should be typed.

Avoid untyped API responses.

---

## Server State Separation

Data from the backend should be managed separately from temporary UI state.

Examples of server state:

- projects
- videos
- transcripts
- comments

Examples of UI state:

- current selection
- open panels
- playback preferences

---

## Responsive Layout

The application should work on desktop screens.

Primary use cases involve large monitors used during editing workflows.

Mobile support is not a Version 1 goal.

---

# 4. Application Layout

The application consists of three main areas.

```
------------------------------------------------
| Navigation                                   |
------------------------------------------------
|                                              |
| Main Workspace                               |
|                                              |
------------------------------------------------
```

---

# 5. Project View

The project view contains:

- folder navigation
- video list
- project information

Users can:

- browse folders
- upload videos
- create folders
- open videos

---

# 6. Video Review Workspace

The main workspace is the core application screen.

Layout:

```
------------------------------------------------
| Transcript Area        | Video Area           |
|                        |                      |
|                        |                      |
|                        |                      |
------------------------------------------------
```

The user can resize the panels.

---

# 7. Video Player

The video player supports:

- play
- pause
- seeking
- volume control
- fullscreen

The player displays:

- current time
- duration
- waveform (optional)
- in and out timestamps and markers on the timeline of the video for a current transcript selection

---

# 8. Transcript Viewer

The transcript viewer displays:

- speaker name
- transcript segments
- tokens

Active tokens are highlighted during playback.

---

# 9. Transcript Synchronization

During playback:

1. Current video time is tracked.
2. The matching token is found.
3. The token is highlighted.
4. Optional auto-follow scrolls the transcript.

Users can disable auto-follow.

---

# 10. Transcript Selection

Users select transcript ranges by dragging over text.

A selection displays:

- selected text
- start timecode
- end timecode

Available actions:

- play selection
- comment
- edit
- copy

---

# 11. Dual Transcript View

Users can open two transcripts simultaneously.

Example:

```
------------------------------------------------
| Original Transcript | Translation            |
|                     |                        |
------------------------------------------------
|                    Video                     |
------------------------------------------------
```

Both transcripts remain synchronized with the video.

---

# 12. Transcript Editing UI

The editor supports:

## Single Token Edit

User selects a token and edits the text.

Example:

```
teh

↓

the
```

---

## Delete

User removes unwanted text.

Deleted tokens disappear from the visible transcript.

---

## Merge

User selects multiple tokens and replaces them with one token.

Example:

```
do not

↓

don't
```

---

## Split

User splits one token into multiple tokens.

Example:

```
cannot

↓

can not
```

---

# 13. Comments UI

Comments appear attached to transcript ranges.

A comment displays:

- author
- text
- timestamp
- resolve state

Users can:

- create comments
- reply
- resolve

---

# 14. Search UI

Search should provide:

- input field
- matching results
- context preview

Selecting a result:

- opens the relevant video
- seeks to the location
- highlights the transcript range

---

# 15. Chat UI

Project-scoped chat for asking questions about a project's videos, entered
via an "Ask" button alongside Search.

Chat should provide:

- a question input, disabled with a "Thinking…" state while a request is in
  flight (synchronous — no streaming); the question appears immediately in
  its own bubble and a placeholder "answering" bubble stands in for the
  assistant's turn until the response arrives, rather than only disabling
  the input
- a synthesized prose answer with inline citation cards (not plain links),
  interleaved at the point in the answer text they support
- a conversation-history list in the chat header (title + recency, most
  recently active first) so a past conversation can be found and reloaded
  without needing its URL — see **List Conversations** in
  `docs/700_backend_api.md`
- reload of a past conversation without re-asking

Selecting a citation card:

- opens the relevant video
- seeks to the location
- highlights the full cited token range in the **original** transcript pane,
  even when the citation matched via a translation

---

# 16. Export UI

Users can export transcripts.

Supported formats:

- Markdown
- SRT

Export flow:

1. Select format.
2. Start export.
3. Monitor processing.
4. Download result.

---

# 17. Keyboard Controls

Version 1 supports:

```
Space

Play/Pause


Ctrl/Cmd + F

Search


Ctrl/Cmd + S

Save
```

Additional shortcuts may be added later.

---

# 18. Frontend State

Important UI state includes:

## Workspace State

- active project
- active folder
- active video

---

## Transcript State

- active transcript
- selection
- editing state

---

## Playback State

- current time
- playing state
- auto-follow enabled

---

## Comment State

- open threads
- selected comment

---

# 19. Future Extensions

The frontend should allow future additions:

- transcript summaries
- collaborative editing
- Resolve integration
