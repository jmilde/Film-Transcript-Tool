# Manual browser testing via Playwright MCP

Notes for driving the running frontend dev server with the Playwright MCP tools (`mcp__playwright__*`), so screenshots/exploration can be reproduced quickly without re-deriving navigation paths each time.

## Prerequisites

- Frontend dev server running at `http://localhost:5173/` (and backend API it talks to).
- Playwright's Chrome browser installed once via `npx playwright install chrome` (only needed if you hit `Chromium distribution 'chrome' is not found`).

## Log in

1. `browser_navigate` to `http://localhost:5173/` — unauthenticated sessions redirect to `/signin`.
2. Fill the sign-in form (`Email` / `Password` textboxes) via `browser_fill_form`, then click `Sign in`.
3. On success you land on `/` with the Projects list.

Ask the user for credentials if you don't have them memorized for this project — don't guess or reuse credentials from another project.

## Top-level navigation

From the Projects list (`/`), click a project name (e.g. "xochi") to open it at `/projects/{project_id}`. The project page header has:

- **Members** — project membership management.
- **Ask** — navigates to `/projects/{project_id}/chat/{chat_id}`, a chat UI for asking questions about the project's videos (RAG-style). Type a question into the "Ask about this project's videos…" textbox and press Enter/submit; the assistant streams a "Thinking…"/"Searching for …" status before the final answer appears, so wait a few seconds (~5-10s) before screenshotting.
- **Search ⌘F** — navigates to `/projects/{project_id}/search`. Type into "Search transcripts, speakers, comments…" and press Enter; results appear as a list of transcript/speaker/comment hits with video name, folder path, and timestamp. Query is reflected in the URL as `?q=...`.

## Folders and videos

The project page's left sidebar lists **Folders** (self-nesting). Click the "▸ Expand" toggle next to a folder to reveal subfolders, then click a subfolder name to list its videos in the main pane. Click a video row to open `/videos/{video_id}`.

## Video page

The video page (`/videos/{video_id}`) shows, left to right: transcript panel (with per-word tokens, search, and "Auto-follow" to scroll transcript with playback), video player + waveform + comments, and an optional right-hand Documents panel. Header buttons:

- **Translations** — click to reveal a row of translation language tabs (e.g. "English") plus "+ Add translation". Clicking a language tab splits the transcript panel into side-by-side **Original** / **Translation (xx)** columns, each independently searchable with its own Auto-follow toggle.
- **Export** — export menu (SRT/Markdown etc., per `docs/900_export.md`).

## Document panel

Toggled via the "Open document panel" / "Close document panel" button at the far right edge of the app (a vertical strip separator with the toggle button lives outside the main content, docked to the window's right edge — it's present on every page, not just the video page, but is disabled until a project context is loaded).

Once open it shows:

- An "Active document" dropdown to switch between existing documents for the project, plus a delete-document icon.
- A "New document title…" input + "New" button to create a document.
- The document body itself, a ProseMirror-backed rich text editor with a floating format toolbar (Bold/Italic/H1/H2/Bullet list) that appears near text selections, and inline clip-reference chips (e.g. pasted transcript excerpts) that carry a "Mark insert point here" affordance and a hover toolbar with Copy/Comment actions.

## Screenshotting tips

- Use `browser_take_screenshot` with `fullPage: true` to capture the whole viewport including the document panel on the right.
- For Search and Ask, call `browser_wait_for` (a couple seconds for search, ~8s for Ask's LLM response) before screenshotting so results have loaded.
- Use `browser_snapshot` (accessibility tree, not a screenshot) to get element `ref`s for clicking/typing — refs are only valid until the next navigation/snapshot.
