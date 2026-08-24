# Semantic Search Specification

**Project:** Film Transcript Tool

**Status:** Draft

**Version:** 0.1

---

# 1. Purpose

This document defines project-scoped semantic chat search over video
transcripts: chunking, embeddings, hybrid retrieval, reranking, the LLM
agent that answers questions, and the citation contract the frontend renders.
It supersedes the "AI-assisted search"/"semantic search" exclusions
previously listed in `docs/100_product_spec.md` §16 and
`docs/300_architecture.md`.

Related documents: `docs/300_architecture.md` §12 (component summary),
`docs/400_database.md` §18–20 (`Transcript Chunk`, `Chat Conversation`,
`Chat Message` table definitions), `docs/700_backend_api.md` §13 (`Chat`
routes), `docs/800_frontend.md` §15 (`Chat UI`).

---

# 2. Answer Mode

A question gets a synthesized prose answer with structured citations, not a
bare ranked list of matches. Citations render as rich, seekable preview
cards interleaved into the answer text — not plain links.

The chat endpoint is synchronous request/response. There is no
streaming/SSE/WebSocket anywhere in this stack, and citations are validated
server-side before the client ever sees them.

---

# 3. Chunking

One chunk per `TranscriptSegment`. A segment whose displayed text (edited
text over original, joined across its tokens) exceeds roughly 800 characters
is sub-split into multiple consecutive same-segment chunks — there is no
cross-segment windowing or overlap.

Every transcript belonging to a video is chunked and embedded independently,
**including translations** — this gives recall in whichever language a
question is asked in. See §6 for how a match is resolved back to a single
citation.

A chunk is anchored to a token range (`start_token_id`/`end_token_id`), not
just a time range, so the frontend can highlight the exact span rather than
just seeking near it.

---

# 4. Embedding & Indexing

Each chunk gets:

- a fixed-dimension embedding vector, for approximate nearest-neighbor (ANN)
  search
- a full-text search vector (`search_vector`), populated by the embedding
  job using a Postgres text-search config chosen by the chunk's
  `language` (e.g. `spanish`, `english`, falling back to `simple` for an
  unmapped language) — **not** a single hardcoded config, since original
  transcripts are not always English

Both are computed once, when the chunk is created, not recomputed on every
query.

## Re-embedding

There is no live re-embed on token edits — editing a transcript does not
retroactively update its chunks. A transcript is auto-embedded once, when
transcription or translation completes. `POST
/transcripts/{transcript_id}/reindex` (`docs/700_backend_api.md` §9) forces a full
re-embed on demand, e.g. after a heavy editing pass.

---

# 5. Retrieval Pipeline

Given a query (typically the agent's tool call, see §7):

1. **Embed** the query with the configured embeddings model.
2. **ANN search** — order a project's chunks by cosine distance to the query
   embedding, take the nearest candidates.
3. **Full-text search** — run the query as a `plainto_tsquery('simple', ...)`
   match against `search_vector`, take the matching candidates. `simple`
   (no stemming) is used on the query side so this leg matches literal
   tokens regardless of which language config indexed a given chunk.
4. **Union** the two candidate sets by chunk id (a chunk found by both legs
   counts once).
5. **Rerank** the union with a dedicated reranking model, for a single
   relevance ordering across both recall signals.
6. **Resolve** each winning chunk to its original-language chunk (§6) and
   take the top ~8, highest-ranked first.

All of the above is scoped to one project — the same authorization boundary
as full-text search (`docs/700_backend_api.md` §12).

---

# 6. Original vs. Translation Resolution

Every transcript is embedded (§3), so a translation chunk can be the best
match for a query asked in that language. But a citation must always point
at content the user can already see on the left-hand pane of the video
workspace — which always shows the **original** transcript
(`docs/800_frontend.md` §11 Dual Transcript View).

So: if a winning chunk belongs to a translation transcript, it is resolved
to the original-language transcript's chunk that overlaps its time range the
most (`docs/400_database.md` §18 `Transcript Chunk`). If no original chunk overlaps at
all (e.g. the original hasn't been embedded yet), the translation chunk is
kept as-is rather than dropping a real result.

Two winning chunks that resolve to the same original chunk (e.g. one in each
of two translations) collapse to a single citation.

---

# 7. Agent & Tool Contract

One agent, one tool, per chat turn:

- **Tool**: `search_transcripts(query: str) -> list[ChunkResult]` — runs
  the retrieval pipeline (§5) scoped to the project, records every returned
  chunk id, and returns each chunk's video name, speaker, start time, and
  text for the model to read.
- **Agent**: decides when and how to query. There is no separate
  deterministic query-reformulation step — if the first search doesn't turn
  up enough to answer confidently, the agent calls the tool again with
  different phrasing itself.
- **Output**: a structured `{answer: str, citations: [{marker, chunk_id}]}`.
  The answer's prose marks every claim it supports with an inline bracketed
  number at the point it appears (`"...at dusk [1]."`), and every inline
  marker has a matching `citations` entry with that same `marker` number.

## Hallucination Guard

The agent is instructed to only cite `chunk_id`s a tool call actually
returned, but that's a prompt instruction, not a guarantee. Before a citation
is shown to the user or persisted, it is checked against every chunk id the
tool returned during that run; anything else is dropped. A marker left in
the prose with no surviving citation renders as literal text on the
frontend rather than a broken card.

## Multi-Turn Continuity

The agent's own serialized conversation state (`ChatConversation
.agent_message_history`) is fed back in as `message_history` on the next
turn of the same conversation, so the agent remembers what it already
searched without re-deriving it from the display-shaped `ChatMessage` rows.

---

# 8. Provider & Model Defaults

All AI calls (agent, embeddings, reranking) go through **OpenRouter** with a
single API key. Chat/agent and embeddings use OpenRouter's OpenAI-compatible
API; reranking has no such standard shape, so it is a small hand-rolled
client mirroring Cohere's rerank request/response format.

Version 1 defaults:

- **Agent model**: a cheap, always-current Gemini Flash-tier alias
- **Embeddings model**: a 1536-dimension OpenAI-compatible embeddings model
- **Rerank model**: Cohere's rerank model, via OpenRouter

Changing the embeddings model requires a migration plus a full re-embed
(the vector column's dimension is fixed), not just a config change. Changing
the agent or rerank model is a one-line config change.

---

# 9. Citation JSON Contract

Persisted on `ChatMessage.citations` (assistant messages only) and returned
by both chat routes:

```json
{
	"marker": 1,
	"chunk_id": "uuid",
	"transcript_id": "uuid",
	"video_id": "uuid",
	"video_name": "Interview A",
	"segment_id": "uuid",
	"start_token_id": "uuid",
	"end_token_id": "uuid",
	"start_time": 12.5,
	"end_time": 14.0,
	"speaker_name": "Jordan",
	"language": "en",
	"excerpt": "The keeper lit the lamp at dusk."
}
```

Two fields are **not** persisted, and are computed fresh by the route on
every response instead: `thumbnail_token` (a short-lived signed media
token) and `folder_path` (can go stale as folders are moved/renamed) — the
same reasoning `docs/700_backend_api.md` §12 Search applies to
`SearchVideoGroup`.

`start_token_id`/`end_token_id` are always token ids in the **original**
transcript (§6), so the frontend can pass them straight to the same
range-highlight mechanism full-text search results use
(`docs/800_frontend.md` §10 Transcript Selection).

---

# 10. Frontend Rendering Contract

`ChatMessageList` splits an assistant message's `content` on its inline
`[n]` markers and renders a citation card in place of each one whose
`marker` has a surviving `citations` entry (§7's hallucination guard can
drop one whose marker is still in the prose — that marker renders as plain
text, not a broken card). A `citations` entry with no corresponding `[n]` in
the text is not rendered separately.

Clicking a citation card navigates to the cited video with the same
pending-navigation state shape full-text search results use, extended with
`endTokenId` so a multi-token chunk span highlights fully rather than just
its first token (`docs/800_frontend.md` §10).
