# Document Builder Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines the Document Builder: project-scoped documents that
mix a user's own prose with embedded clip blocks — non-editable references
to a transcript token range and video, resolved fresh on every read. It
replaces the workaround of keeping a separate Google Doc open and
copy-pasting transcript excerpts into it while writing narration or notes.

Related documents: `docs/100_product_spec.md` §15, `docs/300_architecture.md`
§13, `docs/400_database.md` §21 (`Document` table), `docs/700_backend_api.md`
§14 (`Documents` routes), `docs/800_frontend.md` §19 (`Document Builder UI`).

This repo has two directly analogous patterns this feature builds on:
**Comments** (`Comment` + separate `CommentRange{start_token_id,
end_token_id}`, timecodes derived from tokens on read) and **chat
citations** (`ChatMessage.citations` JSONB, resolved fresh on every read
for excerpt/thumbnail/breadcrumb — `docs/1000_semantic_search.md` §9–10).

---

# 2. Data Model

`Document` (`docs/400_database.md` §21): `project_id`, `title`, `content`
(JSONB), `version`. A project MAY have multiple documents.

`content` is the whole document as one opaque TipTap/ProseMirror JSON
tree: prose nodes (paragraphs, headings, lists) plus custom `clipBlock`
nodes:

```json
{
	"type": "clipBlock",
	"attrs": {
		"nodeId": "client-generated uuid",
		"transcriptId": "uuid",
		"videoId": "uuid",
		"startTokenId": "uuid",
		"endTokenId": "uuid",
		"note": "user's own caption, or null"
	}
}
```

There is no separate block/position table. A rich-text tree doesn't fit
the flat fractional-`position` pattern `TranscriptSegment`/
`TranscriptToken` use, and there's in-repo precedent for storing an
editor/agent's own opaque JSON blob (`ChatConversation
.agent_message_history`).

`note` is the clip's user-editable caption, kept structurally separate
from the excerpt (which is never stored — always resolved fresh from
tokens on read, exactly like a chat citation's excerpt).

## Concurrency

Whole-document optimistic locking via `version`/`expected_version`
(mirrors `TranscriptToken.version`) — not last-write-wins, not CRDT-level
per-block locking. Losing an entire document is a bigger blast radius than
losing one token edit, and the check is nearly free. This is acceptable
for v1's single-user-at-a-time assumption; a true multi-user co-editing
requirement would need a different storage shape (e.g. Yjs), not an
extension of this one.

---

# 3. Clip Block Anchoring & Resolution Rules

A clip block anchors to whichever transcript (original or translation)
was on screen when the clip was selected — following the **Comment**
pattern, **not** the chat citation's forced-resolve-to-original rule.
That rule only works for chat because citations match at chunk-level time
overlap, not token identity; there is no token-level alignment between an
original transcript and a translation
(`app/services/translation.py`, `docs/500_transcript_model.md` §13), so
there is no equivalent way to force a clip block onto the original
transcript without inventing an approximate heuristic that doesn't exist
anywhere else in this codebase. Comments already solve this the simple
way — anchor to whatever's on screen — and clip blocks do the same.

The excerpt is still always resolved fresh from that transcript's live
tokens on read (§4), so it can't drift even though the anchor transcript
itself is fixed at insert time.

A clip's token range can span multiple segments (a drag-selection is not
confined to one speaker turn); the excerpt joins every non-deleted
token's displayed text in transcript order (`(segment.position,
token.position)`), and the reported speaker is the range's first
segment's speaker.

---

# 4. API Contract

See `docs/700_backend_api.md` §14 for full request/response shapes.

| Method & path | Role floor | Notes |
|---|---|---|
| `POST /projects/{project_id}/documents` | editor | `{title}` → empty-content document |
| `GET /projects/{project_id}/documents` | viewer | list summaries (no `content`) |
| `GET /documents/{document_id}` | viewer | full document, clip nodes resolved fresh |
| `PATCH /documents/{document_id}` | editor | `{title?, content?, expected_version}` → document or `409` |
| `DELETE /documents/{document_id}` | editor | `204` |
| `POST /documents/{document_id}/clip-blocks/resolve` | viewer | resolve one clip's display fields immediately on insert |

Every clip-block-resolving endpoint (`GET /documents/{id}` and the resolve
route) enforces that the referenced transcript belongs to the **same
project** as the document. Without this, a member of one project could
write a clip block naming another project's transcript id and read that
transcript's excerpt/video name back through their own document —
bypassing that other project's membership check entirely. A cross-project
reference is rejected as `404` (not `403`), so it isn't distinguishable
from an unknown id.

Resolving a document's full content batches per referenced transcript
(one ordered-token query, one video/speaker/thumbnail/breadcrumb lookup
per set) rather than per clip node, so a multi-clip document costs a
handful of queries, not one per clip.

---

# 5. Editor Contract

**Library: TipTap** (`@tiptap/react`, `@tiptap/starter-kit`,
`@tiptap/core`) — the practical choice for a custom node that renders a
real interactive React component inline (`ReactNodeViewRenderer`), needed
for the clip block card.

- Node schema: `StarterKit` restricted to `paragraph`, `heading` (h1–h2),
  bold/italic marks, bullet/ordered lists — no tables/images/code blocks
  for v1.
- Custom `clipBlock` node: `atom: true` (non-editable, no direct text
  content), attrs as in §2, plus an `insertClipBlockAt(pos, attrs)`
  command for programmatic insertion.
- The card (thumbnail, video name, timecode, non-editable excerpt,
  editable note, play button) is styled off the chat citation card.
- Save: content changes are debounced (~1s) into a `PATCH` carrying the
  last-known `version`; a `409` shows the same conflict/reload banner
  pattern already used for token-edit conflicts.
- Before every save, the backend's read-only resolved fields (excerpt,
  video name, thumbnail token, ...) are stripped back out of every
  `clipBlock` node's attrs first, so a stale excerpt can never be
  persisted — only the canonical fields in §2's JSON shape are ever
  written back.

---

# 6. Global Panel UX

**Mount point:** the top-level app shell, as a **persistent resizable
column** docked as a sibling of the routed page — not an overlay/drawer
(which would defeat the point of writing while still browsing) and not
nested inside the video workspace's own resizable-panel group (so the two
panel systems never fight over space). It collapses to a thin toggle rail
when closed, and stays mounted across navigation between the project
view, search, chat, and the video workspace.

**Insert-queue flow:** an "Add to Document" entry point (transcript
selection, chat citation, search hit) never touches the editor directly.
It queues the minimal reference ids in a shared panel store; that store
action opens the panel if closed. Once the target document's editor is
mounted, it consumes the queued payload, resolves its display fields via
the clip-blocks/resolve endpoint (§4), and inserts the node — so nothing
is silently dropped if the panel or editor wasn't ready yet.

**Player coordination:** clicking a clip block's play button reuses the
video workspace's own player when that page is already open on the
clip's video (seeking within it — never a second player for the same
video at once); otherwise the panel renders its own lightweight preview
player. That preview player deliberately does not share the video
workspace's global playback state (current time, duration, waveform
sync) — a second writer to that shared state would corrupt the
workspace's own display for an unrelated video. It has no waveform or
transcript sync, just play/pause/seek for the previewed range.

---

# 7. Frontend Rendering Contract

A clip block card renders:

- a thumbnail (or a placeholder icon if the video has none yet)
- video name and timecode range
- a folder breadcrumb, if the video is nested
- the excerpt, quoted and non-editable
- an editable note input, writing only the `note` attr
- a play button (§6)

None of the resolved display fields are part of the document's authored
prose — they're read-only decoration around a structural reference, drawn
from the same augmented-attrs shape the backend injects into `content` on
every read (§4).
