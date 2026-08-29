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
- documents
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

The application consists of a navigation bar, the routed main workspace,
and a persistent document panel — mounted once in the top-level app shell
(not per page), so it stays open across navigation instead of resetting
when the user moves between pages.

The routed workspace and the document panel are both resizable `Panel`s
of one shared top-level `Group` (react-resizable-panels), not a flat
peer/fallback layout — the document panel is a first-class member of the
same resizable-panel system as the page it sits beside, so the two never
fight over space and resize/collapse using identical mechanics:

```
------------------------------------------------
| Navigation                                   |
------------------------------------------------
| Group (horizontal)                           |
|  ------------------------------------------  |
|  | Panel: routed page  | Panel: Document   |  |
|  | (Outlet)             | Panel             |  |
|  |                      |                   |  |
|  ------------------------------------------  |
------------------------------------------------
```

The document panel's `Panel` is `collapsible`, collapsing to a thin
toggle rail (matching `collapsedSize`) when closed rather than unmounting
— it stays mounted across navigation. See §19 Document Builder UI.

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
- add to document (queues a clip block insert into the document panel's
  active document — see §19)

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

Comments appear attached to a transcript range or, from the document
panel, to a document (a run of prose text or a clip reference) — see §18
Comment State and §19 Document Builder UI.

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

A transcript-text result also offers "add to document" (§19), queuing a
single-token clip insert — speaker/comment results have no token range to
anchor to, so they don't.

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
- a persistent left-hand history sidebar listing the project's conversations
  (title + recency, most recently active first) with a "New chat" action, so
  a past conversation can be found and reloaded without needing its URL —
  see **List Conversations** in `docs/700_backend_api.md`
- reload of a past conversation without re-asking; landing on Chat with no
  conversation selected opens the most recently active one by default
  (explicitly starting a new chat is a distinct action, not the default)

Selecting a citation card:

- opens the relevant video
- seeks to the location
- highlights the full cited token range in the **original** transcript pane,
  even when the citation matched via a translation

A citation card also offers "add to document" (§19), queuing the cited
range as a clip insert.

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

This state is anchor-agnostic: a comment's `anchor` may be a transcript
range or a document (§13 Comments UI, `docs/700_backend_api.md` §11), but
which reply threads are expanded and which comment is selected is tracked
the same way regardless of anchor kind.

---

## Document Panel State

- open/closed
- active project (synced from whichever project-scoped page is current)
- active document
- pending clip insert (queued until the editor is ready to receive it)
- preview clip (set when a clip's video isn't already open in the video
  workspace, so the panel renders its own preview player)
- insert-marker flag: whether the active document currently has an
  insert point marked (not the position itself, which lives in the
  editor's own ProseMirror plugin state so it stays correctly mapped
  through edits) — lets other components render "a marker is set"
  without reaching into the editor instance

---

# 19. Document Builder UI

A persistent, project-scoped panel (§4) for building documents that mix
prose with clip blocks. Docked as a resizable column, not an overlay — an
overlay covering page content would defeat the point of writing while
still able to browse/search/ask.

Panel contents:

- a document switcher: list, create, rename, delete, select the active
  document
- a rich-text editor (TipTap) over the active document's content
- each clip block renders inline, within the surrounding prose, as
  excerpt text with a persistent left border + background tint (marking
  "this text is from source material") — not a boxed card. An underline
  is added only once a comment exists on the clip, so the two decoration
  channels (source-material tint, has-a-comment underline) stack without
  colliding. A clip's user-facing note is not part of the node's own
  rendering — it is a regular comment (see below) — and the excerpt
  itself is never directly editable
- selecting a clip block (click, or arrow-key onto it) shows a shared
  bubble menu with Play / Comment / Remove actions (§12-equivalent
  `SelectionToolbar`/`BubbleMenu` pattern), rather than the card itself
  carrying inline controls

A clip's annotation is a regular Comment (§13) anchored via
`DocumentCommentAnchor.clip_node_id`, created through the bubble menu's
Comment action — it is not a `note` attribute stored on the clip node
itself, so clip annotations get the same reply/resolve/search treatment
as any other comment instead of a bespoke field.

Add-to-document entry points (§10 Transcript Selection, §15 Chat UI's
citation cards, §14 Search UI's results) queue a clip insert; if the panel
or its editor isn't mounted yet, the insert is queued and applied once it
is, so nothing is silently dropped.

## Player Coordination

Clicking a clip block's play button:

- reuses the video workspace's existing player if that page is already
  open on the clip's video, seeking within it — never a second player for
  the same video at once
- otherwise, the panel plays the clip in its own lightweight preview
  player (no waveform/transcript sync, unlike the full workspace player)

Both players render identical play/pause/±5s-skip/2x-speed chrome from
one shared, purely-presentational control component: the workspace
player wires it to the global playback store, while the panel's preview
player wires the same component to local state instead (it deliberately
never touches the global store — a second writer there would corrupt the
workspace's own display for an unrelated video). The preview player has
no waveform, so — unlike the full workspace player, where the waveform is
the primary scrub/seek surface — its only seek mechanism is the ±5s skip
buttons.

## Concurrency

A stale save (the document was edited elsewhere since this client last
read it) shows the same conflict banner pattern used for token edits
(§12) — the local attempt is not overwritten or silently retried; the
user must reload before continuing.

---

# 20. Future Extensions

The frontend should allow future additions:

- transcript summaries
- collaborative editing
- Resolve integration
