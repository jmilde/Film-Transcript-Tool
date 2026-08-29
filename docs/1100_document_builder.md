# Document Builder Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines the Document Builder: project-scoped documents that
mix a user's own prose with embedded clip references — non-editable,
inline references to a transcript token range and video, resolved fresh
on every read. It replaces the workaround of keeping a separate Google
Doc open and copy-pasting transcript excerpts into it while writing
narration or notes.

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
		"endTokenId": "uuid"
	}
}
```

`clipBlock` is an inline atomic node (`group: "inline", atom: true`),
not a block-level node — it sits within the surrounding paragraph flow
like a styled span, not as its own card-shaped block. There is no
separate block/position table. A rich-text tree doesn't fit the flat
fractional-`position` pattern `TranscriptSegment`/`TranscriptToken` use,
and there's in-repo precedent for storing an editor/agent's own opaque
JSON blob (`ChatConversation.agent_message_history`).

There is no `note` attr on the node. A clip's user-facing annotation is a
regular `Comment` row instead, anchored via
`DocumentCommentAnchor.clip_node_id = nodeId` (`docs/400_database.md`
§13–14a) — this reuses the same comment/reply/resolve/search machinery
transcript comments already have, rather than a bespoke per-clip caption
field with none of that. The excerpt itself is never stored on the node
either — always resolved fresh from tokens on read, exactly like a chat
citation's excerpt.

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
for the clip reference's node view.

- Node schema: `StarterKit` restricted to `paragraph`, `heading` (h1–h2),
  bold/italic marks, bullet/ordered lists — no tables/images/code blocks
  for v1.
- Custom `clipBlock` node: `group: "inline", inline: true, atom: true,
  selectable: true` (non-editable, no direct text content, but
  selectable via a native ProseMirror `NodeSelection` — click, or
  arrow-key onto it), attrs as in §2, plus an `insertClipBlockAt(pos,
  attrs)` command for programmatic insertion that lands the node inline
  within the surrounding text rather than always opening a new
  paragraph.
- Rendering: excerpt text with a persistent left border + background
  tint (marks "this text is from source material"), plus an underline
  reserved exclusively for "has a comment" — the two decoration channels
  stack without colliding. Selecting the node shows a shared `BubbleMenu`
  with Play/Comment/Remove actions (§6/§7); the node view itself renders
  only the excerpt and its decoration classes, no inline controls of its
  own.
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
`Panel`** that is a sibling of the routed page's own `Panel` inside one
shared top-level `Group` (react-resizable-panels) — not an overlay/drawer
(which would defeat the point of writing while still browsing), and not
a flat peer/fallback sidebar living outside the resizable-panel system.
Being a first-class `Panel` in the same `Group` as the routed page means
it resizes/collapses with the exact same mechanics as any other panel,
and never fights the video workspace's own separate resizable-panel
group (waveform/transcript) for space, since that group is nested one
level down, inside the routed-page `Panel`, not a sibling of the document
panel. It collapses to a thin toggle rail when closed (`collapsedSize`,
not unmounted), and stays mounted across navigation between the project
view, search, chat, and the video workspace.

**Insert-queue flow:** the only "Add to Document" entry point is a
transcript selection (`docs/800_frontend.md` §10) — chat citations and
search hits don't offer it, so a clip's anchor is always chosen
deliberately from the transcript itself. It never touches the editor
directly: it queues the minimal reference ids in a shared panel store,
which opens the panel if closed. Once the target document's editor is
mounted, it consumes the queued payload, resolves its display fields via
the clip-blocks/resolve endpoint (§4), and inserts the node — so nothing
is silently dropped if the panel or editor wasn't ready yet.

**Player coordination:** clicking a clip reference's Play action (§7's
bubble menu) always plays in the panel's own lightweight preview player —
never the video workspace's player, even when that page is already open on
the same video. The two are kept fully separate on purpose: writing in the
document panel must never hijack or reseek whatever the user currently has
on screen in the workspace. The preview player does not share the video
workspace's global playback state (current time, duration, waveform sync)
at all; it has no waveform or transcript sync, just play/pause/seek for the
previewed range. Both players render identical chrome (play/pause, ±5s
skip, 2x speed) from one shared presentational control component — the
workspace player wires it to the global playback store, the preview player
wires the same component to local state only — so chrome parity is
achieved without the preview player ever touching the shared store.
Because the preview player has no accompanying waveform, its ±5s skip
buttons are its only seek mechanism (the workspace player's primary scrub
surface is the waveform, not this control row).

---

# 7. Frontend Rendering Contract

A clip reference renders inline, within the surrounding paragraph flow,
not as a boxed card:

- the excerpt text itself, non-editable, with a persistent left border +
  background tint marking "this text is from source material"
- an underline, added only once a comment exists on the clip (resolved
  vs. unresolved rendered as two different underline colors) — reserved
  exclusively for "has a comment", so it never collides with the
  border/tint decoration
- a selection ring when the node is the current `NodeSelection`

Selecting the node (click, or arrow-key onto it) opens the shared
`BubbleMenu` used across the editor (§5, `docs/800_frontend.md` §19),
showing the excerpt and timecode range as a summary plus Play / Comment /
Remove actions (§6) — the node view itself carries no inline controls,
no thumbnail, no video name, and no folder breadcrumb; those richer
display fields are resolved into the node's attrs (§4) for potential
future use but are not currently part of the rendered UI.

None of the resolved display fields are part of the document's authored
prose — they're read-only decoration around a structural reference, drawn
from the same augmented-attrs shape the backend injects into `content` on
every read (§4).
