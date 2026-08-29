# Frontend design-system overhaul — implementation TODO

Persistent, git-tracked task checklist for a complete frontend visual +
UX overhaul: a design system (theme variables, primitives), a restyle of
every page, and an information-architecture cleanup of navigation and
Search/Ask. Mirrors the style of `TODO.md` / `TODO_SEARCH_REDESIGN.md` /
`TODO_DOCUMENT_UX.md`. Read `CONTEXT.md` (Token vs. theme variable),
`docs/adr/0001-search-overlay-chat-route.md`, and
`docs/adr/0002-radix-for-overlays-only.md` before starting — this file is
the checklist, those are the "why."

Any agent picking this up should work top to bottom and check items off
(edit this file and commit) as they land — don't just remember it.
Ground rules, same as every other `TODO_*.md` in this repo:

- Tests-first: write/adjust a failing test, then implement.
- Frontend: no `any` on API boundaries; if a backend schema changes,
  regenerate `frontend/src/api/schema.d.ts` via `make openapi` (repo
  root) before touching frontend code that depends on it; server state
  (TanStack Query) stays separate from local UI state (zustand).
- Backend touches (there is exactly one, Phase 5) must be fully typed,
  `mypy --strict` clean, ruff clean, and pass `make check` before the
  frontend work that depends on them proceeds.
- This is explicitly **not** a long-term project — don't over-engineer.
  Prefer the smaller, more obvious solution at every fork; the point of
  this overhaul is a nicer, more consistent UI, not new abstractions for
  their own sake.
- Every phase ends with a `Verify` step. Don't check a phase's boxes
  without having run it.

## Confirmed decisions (do not re-litigate while implementing)

From the design-grilling session — see `CONTEXT.md`/ADRs for the "why"
behind the two flagged below:

- **Theme variables** (never "design tokens" — that name is reserved for
  the transcript `Token`), as CSS custom properties via Tailwind v4
  `@theme`. Both light and dark built together now.
- **Manual-only** theme switch (header toggle, persisted to
  `localStorage`) — no `prefers-color-scheme` auto-detection.
- **One primary brand hue + neutral grays + a small semantic set**
  (success/warning/danger/info). No decorative multi-hue palette.
- **One font family** throughout; headings differentiated by weight/size
  only, not a second typeface.
- **`lucide-react`** replaces the hand-rolled SVGs in
  `frontend/src/components/icons.tsx`.
- **Lightweight CSS-only transitions** (Tailwind's `transition-*`
  utilities) on overlays and hover/active states. No animation library.
- **Flat `frontend/src/components/ui/` primitives folder** — no strict
  atomic-design taxonomy (atoms/molecules/organisms).
- **Radix UI (unstyled) only for overlay-heavy primitives** — Dialog,
  Popover, Tooltip, DropdownMenu, Select — per ADR 0002. Everything else
  (Button, Input, Card, Badge, …) is hand-rolled Tailwind.
- **Airy, pastel-card "dashboard" treatment** (per `ui-inspo.webp`) on
  browsing pages: Projects, Search, Chat. **Denser, mostly-neutral**
  variant for the editing workspace (transcript/video/document panel) —
  color reserved for meaning (active token, selection, status), not
  decoration. Buttons/controls/radii/spacing scale stay one consistent
  language across both; it's specifically the big decorative stat-card
  layout that doesn't carry over to the dense workspace.
- **Search becomes a global command-palette overlay** (⌘F, reachable
  from every page including `VideoWorkspace`); its last query/results
  live in a session-only client store so "back to search" restores
  exactly where it was left. Per ADR 0001.
- **Chat stays a dedicated route** (history sidebar doesn't fit a
  drawer) but gains a persistent header entry point reachable from every
  page, not just the project page. Per ADR 0001.
- **Uniform persistent header** across all pages: logo, breadcrumb
  (Project / Folder / Video), the global Search trigger, an Ask link —
  replacing today's ad hoc per-page "← Projects"/"← Project" links.
- **"Back to search/chat" is a separate small affordance next to the
  breadcrumb**, not folded into it — it's navigation history, not
  hierarchy, and folding it in would make the breadcrumb lie when the
  same video is reached by browsing instead.
- Single pass, not phased into separate PRs — but still sequenced below
  so foundation lands before anything consumes it. Existing vitest+RTL
  tests get updated alongside each component in the same phase, not
  deferred.
- Frontend-only, with **one narrow, justified exception** — Phase 5
  below — nothing else should need backend changes.

---

## Phase 0 — Dependencies

- [ ] `cd frontend && npm install @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-select lucide-react`
- [ ] Confirm no other existing dependency already covers one of these (quick grep for `@radix-ui`/`lucide` before adding, in case a partial adoption happened outside this session)
- [ ] Verify: `npm install` clean, `npm run typecheck` still clean (no code changes yet)

## Phase 1 — Theme variables

- [ ] `frontend/src/index.css`: define the theme variable set inside `@theme { ... }` (Tailwind v4) for both light and dark — background/surface/border/text colors at a few elevation levels (page background, card surface, raised surface), one primary brand hue (with a couple of tint/shade steps for hover/active), and the semantic set (success/warning/danger/info, each as a single hue — no multi-step ramps needed for a project this size)
- [ ] Add a `dark` variant strategy — Tailwind v4's `@custom-variant dark (&:where(.dark, .dark *));` class-based approach (not `prefers-color-scheme`, since the switch is manual per the confirmed decisions) — toggled by adding/removing a `dark` class on `<html>`
- [ ] Define the type scale (a handful of heading/body sizes) and radius scale (e.g. `sm`/`md`/`lg`/`full`) as theme variables too, so `components/ui/` primitives reference them instead of ad hoc Tailwind values
- [ ] Pick and wire the single font family (e.g. Inter via `@fontsource` or a system stack — whichever needs zero extra build config) in `@theme`'s `--font-*` and set it as the body default
- [ ] Verify: a throwaway page (or `App.tsx` temporarily) renders visibly different colors/radii when `.dark` is toggled on `<html>` via devtools; remove the throwaway before committing

## Phase 2 — Icon migration

- [ ] Inventory every icon currently exported from `frontend/src/components/icons.tsx` and find its closest `lucide-react` equivalent
- [ ] Replace each call site (`grep -rl` for each icon component name across `src/`) with the `lucide-react` import; delete `icons.tsx` once nothing references it
- [ ] Tests: any test asserting on icon presence via a custom component name (rather than role/text) needs updating to the new import — grep test files for the old icon names
- [ ] Verify: `npm run build` (catches any dangling import), `npm run test` green

## Phase 3 — Core hand-rolled UI primitives

New `frontend/src/components/ui/` folder. Each primitive is a thin,
typed wrapper over plain Tailwind using Phase 1's theme variables — no
new runtime dependency for these.

- [ ] `Button.tsx` — variants (primary/secondary/ghost/destructive), sizes, disabled state, matches inspo's rounded-corner language
- [ ] `Input.tsx` / `Textarea.tsx` — replace the ad hoc `className="rounded border border-slate-300 px-3 py-1.5 text-sm"` inputs scattered across `Projects.tsx`, `ProjectView.tsx`'s `NewFolder`, `SearchPage.tsx`, `ChatInput.tsx`, etc.
- [ ] `Card.tsx` — the airy/pastel variant used on browsing pages and a plain/dense variant used in the workspace (one component, a `variant` prop — not two components, to avoid duplicating the base styles)
- [ ] `Badge.tsx` — pill-shaped, dot-prefixed, semantic-colored (mirrors the inspo's status pills) — used for e.g. job/processing status, search hit "kind" labels
- [ ] `Breadcrumb.tsx` — presentational only (`items: {label, href?}[]`), no data-fetching; used by Phase 6
- [ ] Tests: one test file per primitive covering variants/states via RTL, not snapshot-only
- [ ] Verify: `npm run test` green, `npm run typecheck` clean

## Phase 4 — Radix-backed overlay primitives

- [ ] `Dialog.tsx` wrapping `@radix-ui/react-dialog` — used later for e.g. delete-confirmation flows that currently use bare `confirm()`/inline state (grep for those while here)
- [ ] `Popover.tsx` wrapping `@radix-ui/react-popover`
- [ ] `Tooltip.tsx` wrapping `@radix-ui/react-tooltip`
- [ ] `DropdownMenu.tsx` wrapping `@radix-ui/react-dropdown-menu`
- [ ] `Select.tsx` wrapping `@radix-ui/react-select` — candidate replacement for any native `<select>` (check `TranslationControl.tsx`, `ExportControl.tsx`, the document switcher in `DocumentPanel.tsx`)
- [ ] Apply Phase 0's confirmed transition style: enter/exit animations on all of the above via Tailwind's `data-[state=open]:animate-*`/`data-[state=closed]:animate-*` utilities keyed off Radix's own `data-state` attribute (no separate animation library)
- [ ] `CommandPalette.tsx` — built on `Dialog.tsx` (a dialog is exactly a command palette's structural shell: overlay + focus-trapped panel); this is the container Phase 7 fills with the search UI
- [ ] Tests: focus-trap/escape-to-close/click-outside-to-close behavior for `Dialog`/`CommandPalette` (Radix provides the behavior; the test proves it's wired, not re-testing Radix itself)
- [ ] Verify: `npm run test` green

## Phase 5 — Backend: expose folder breadcrumb on `VideoRead` (the one backend touch)

Justification for touching the backend at all (see the "frontend-only,
narrow exception" decision above): the new global header breadcrumb
(Phase 6) must show Project → Folder → … → Video on `VideoWorkspace`
even when the user lands on the video directly from Search or Chat,
never having browsed the folder tree — so the ancestor folder names
aren't already sitting in the frontend's query cache the way they are
when navigating there by clicking through `FolderTree`. The search
redesign already solved this exact problem for search result groups
(`backend/app/services/folders.py: build_folder_breadcrumbs`) — reuse it
rather than inventing a second mechanism.

- [ ] `backend/app/schemas/video.py`: add `folder_path: list[str]` to `VideoRead`
- [ ] `backend/app/api/routes/videos.py`: in `_video_read()` (or wherever `VideoRead` is constructed for single-video fetches), call the existing `build_folder_breadcrumbs` for the video's `folder_id` and populate the new field — mirror exactly how `backend/app/services/search.py` already does this for search groups, don't reimplement
- [ ] Tests first: extend `backend/tests/api/routes/test_videos.py`'s `VideoRead`-shape assertions for `folder_path` (flat, nested, root-level-folder cases — reuse `test_folders.py`'s existing fixture shapes from the search redesign work)
- [ ] Verify: `make check` green
- [ ] Run `make openapi` (repo root) and commit the regenerated `frontend/src/api/schema.d.ts` before starting Phase 6

## Phase 6 — Global navigation: uniform header + breadcrumb

- [ ] `frontend/src/components/AppShell.tsx`: redesign the header — logo, `Breadcrumb` (fed by route params + `useProject`/`useVideo`/Phase 5's `folder_path`), a Search trigger button (opens Phase 7's `CommandPalette`, also bound to ⌘F globally — move the keydown handler here from `ProjectView.tsx` so it works on every route, not just the project page), an "Ask" link (navigates to `/projects/:projectId/chat`, disabled/hidden when there's no active project in scope), theme toggle (Phase 1's `.dark` class, persisted), user email + sign out (unchanged)
- [ ] New `frontend/src/components/GlobalHeaderContext.tsx` or a small zustand slice (`store/navigation.ts`) holding "current project id" / "current breadcrumb trail" so `AppShell` (which sits above the router `Outlet`) can render the right breadcrumb without prop-drilling from whichever page is active — each page's `useEffect` already sets `useDocumentPanelStore`'s `setActiveProject`; either extend that store or add a sibling one, whichever avoids duplicating the "which project is active" concept in two stores (check `store/documentPanel.ts` first)
- [ ] Remove the per-page back-links now superseded by the breadcrumb: `ProjectView.tsx`'s "← Projects", `VideoWorkspace.tsx`'s "← Projects" (keep its `pendingSearch?.returnTo` "← Back" — that becomes Phase 9's affordance, not this one), `SearchPage.tsx`'s "← Project" (this whole page is being removed in Phase 7 anyway), `ChatPage.tsx`'s "← Project"
- [ ] Note for the breadcrumb's shape: folder selection inside `ProjectView.tsx` is local component state (`selectedFolderId`), not part of the URL — so a "Folder" crumb only ever resolves on `VideoWorkspace` (via Phase 5's `folder_path`). `Breadcrumb` on `Projects`/`ProjectView`/`SearchCommandPalette`/`ChatPage` routes should render Project only (no folder level to show, not a bug to fix)
- [ ] Remove the now-redundant "Ask"/"Search ⌘F" buttons from `ProjectView.tsx` (superseded by the header)
- [ ] Tests: `AppShell.test.tsx` — breadcrumb renders correct trail for a project-only route vs. a video route (incl. `folder_path`), Search trigger opens the palette, ⌘F opens it from a non-project route (e.g. simulate being on `/videos/:id`), theme toggle flips the `dark` class and persists across a remount (mock `localStorage`)
- [ ] Verify: `npm run test` green; manually confirm the breadcrumb is correct on Projects/ProjectView/VideoWorkspace/Chat

## Phase 7 — Search becomes a global overlay

- [ ] New `frontend/src/store/searchOverlay.ts` (zustand, UI state, session-only — no persistence middleware): `isOpen`, `query`, open/close/setQuery actions only — **not** cached results. TanStack Query already caches `useSearchGroups`'s results by `['search', projectId, query]`, so reopening the overlay with the same `query` restores the same results from that cache for free; duplicating them into the zustand store would be redundant state to keep in sync for no benefit (worst case without it is a brief refetch-flash on reopen if the query cache entry went stale, which is acceptable)
- [ ] New `frontend/src/features/search/SearchCommandPalette.tsx`: renders inside Phase 4's `CommandPalette`, reusing `useSearchGroups` and `SearchVideoGroupCard` from the existing `SearchPage.tsx`/`SearchVideoGroupCard.tsx` — port the query-input/debounce/infinite-scroll logic from `SearchPage.tsx` into this component (the URL-param sync goes away entirely; state lives in `searchOverlay.ts` instead)
- [ ] `frontend/src/features/search/types.ts`: `PendingSearchNav` needs an explicit discriminant now that "origin" has two shapes — a search origin has no URL to return to (reopen the overlay via `searchOverlay.ts`), a chat origin still has a real conversation URL (per Phase 9). Add `origin: 'search' | 'chat'` to the type; when `origin === 'chat'`, `returnTo` stays the conversation pathname string as today; when `origin === 'search'`, drop the `returnTo` string field entirely (there is nothing to store — "reopen the overlay" needs no data). Update both producers (`SearchPage.tsx`/`SearchCommandPalette.tsx` sets `origin: 'search'`, `ChatPage.tsx` sets `origin: 'chat'`) and the one consumer (`VideoWorkspace.tsx`, Phase 9)
- [ ] `frontend/src/pages/SearchPage.tsx`: delete; `frontend/src/app/routes.tsx`: remove the `projects/:projectId/search` route
- [ ] `frontend/src/pages/VideoWorkspace.tsx`: update the `pendingSearch?.returnTo` handling for the new shape (open the overlay instead of `<Link>`-ing to a URL)
- [ ] Tests: move/adapt `SearchPage.test.tsx`'s coverage to `SearchCommandPalette.test.tsx` (query debounce, grouped rendering, no-results, load-more, hit-click nav payload); update `VideoWorkspace.test.tsx`'s back-to-search assertions for the new mechanism; delete `SearchPage.test.tsx`
- [ ] Verify: `npm run test` green; manually confirm ⌘F opens the palette from `VideoWorkspace` (previously impossible), a hit navigates + seeks/highlights as before, and "back to search" reopens with the same query+results

## Phase 8 — Chat gains a global entry point

- [ ] Confirm Phase 6's header "Ask" link covers this (it should, if `AppShell`'s active-project state is wired correctly) — this phase is really "verify it actually works from every route," not new code, given the entry point is a plain route link (per ADR 0001, no overlay/drawer needed)
- [ ] `frontend/src/pages/ChatPage.tsx`: remove the now-redundant `Ask` button reference if any remains after Phase 6's `ProjectView.tsx` cleanup; keep its own internal layout as a route
- [ ] Verify: from `VideoWorkspace`, click the header's Ask link — lands on that project's most-recently-active conversation (existing default-conversation behavior, unchanged)

## Phase 9 — Return-to-origin affordance

- [ ] New `frontend/src/features/navigation/ReturnToOrigin.tsx`: small presentational link/chip, `{ label, onClick }`, rendered next to (not inside) `AppShell`'s breadcrumb — visible only when `VideoWorkspace` has a `pendingSearch` in scope
- [ ] `VideoWorkspace.tsx`: replace the current bespoke "← Back" text link with `<ReturnToOrigin>`, branching on `pendingSearch.origin` (Phase 7's discriminant) — `'search'` reopens `searchOverlay.ts`'s store with the prior query; `'chat'` navigates to `pendingSearch.returnTo` (still a real URL, since Chat stayed a route)
- [ ] Tests: `VideoWorkspace.test.tsx` — arriving via a search hit shows "Back to search" and clicking it reopens the palette with prior state; arriving via a chat citation shows "Back to chat" and clicking it navigates to the right conversation
- [ ] Verify: `npm run test` green

## Phase 10 — Reskin: browsing pages

Apply Phase 1–4's theme variables/primitives and the airy/pastel card
treatment. No behavior changes in this phase — pure visual/markup pass
using the new primitives instead of ad hoc classes.

- [ ] `frontend/src/pages/Projects.tsx`: project list as `Card`s (not a `<ul>` divide-y list), `Button`/`Input` primitives for create-project
- [ ] `frontend/src/pages/ProjectView.tsx`: folder tree + `FolderPanel` restyled with the new `Card`/`Button` primitives; `NewFolder`'s inline form uses `Input`/`Button`
- [ ] `frontend/src/features/folders/FolderTree.tsx`, `FolderPanel.tsx`: restyle rows/icons (lucide equivalents from Phase 2) consistent with the new palette
- [ ] `frontend/src/features/search/SearchVideoGroupCard.tsx`: restyle as a `Card`, `Badge` for hit "kind"
- [ ] `frontend/src/features/chat/ChatHistorySidebar.tsx`, `ChatMessageList.tsx`, `ChatCitationCard.tsx`, `ChatInput.tsx`: restyle with the new primitives; citation cards as `Card`s
- [ ] `frontend/src/features/members/MembersPanel.tsx`: restyle using `Dialog`/`DropdownMenu` if it currently rolls its own popover/modal logic (check first — don't force Radix onto something that's already simple and correct)
- [ ] Tests: existing tests for all of the above updated for new roles/text where markup changed (per the "update tests alongside" decision) — this is the bulk of the expected test churn
- [ ] Verify: `npm run test` green, visually review each page in the browser (light and dark)

## Phase 11 — Reskin: editing workspace

Denser, mostly-neutral variant — color only for meaning. No behavior
changes in this phase either.

- [ ] `frontend/src/pages/VideoWorkspace.tsx`: shell restyle (panel borders/backgrounds via theme variables, not raw `slate-*`)
- [ ] `frontend/src/features/transcript/TranscriptViewer.tsx`: restyle segment/token spacing, active-token highlight color sourced from a theme variable, auto-follow checkbox as a proper control (not a bare `<input type=checkbox>`)
- [ ] `frontend/src/features/toolbar/SelectionToolbar.tsx`: restyle the floating popup (this is the component both the transcript selection and the document bubble menu share — get it right once)
- [ ] `frontend/src/features/comments/CommentsPanel.tsx`: restyle thread/reply UI
- [ ] `frontend/src/features/documents/DocumentPanel.tsx`, `DocumentEditor.tsx`, `ClipBlockView.tsx`, `ClipPreviewPlayer.tsx`: restyle the document switcher, fixed formatting toolbar, the "page" look (border/padding/shadow — tune against the new theme variables rather than hardcoded `white`/`gray-50`), clip-block border+tint colors sourced from theme variables
- [ ] `frontend/src/features/player/VideoPlayer.tsx`, `PlayerControls.tsx`, `Waveform.tsx`: restyle control chrome consistently between the two player instances (workspace + document-panel preview) — they already share `PlayerControls`, so this should mostly be a theme-variable swap in one place
- [ ] `frontend/src/features/translation/TranslationControl.tsx`, `frontend/src/features/export/ExportControl.tsx`: restyle, migrate native `<select>`/dropdown to Phase 4's `Select`/`DropdownMenu` if applicable
- [ ] Tests: existing tests updated for markup/role changes
- [ ] Verify: `npm run test` green, visually review a full editing session (transcript + video + document panel + comments) in light and dark

## Phase 12 — Reskin: sign-in

- [ ] `frontend/src/pages/SignIn.tsx`: restyle with the new primitives/theme (outside `AppShell`, so no header/breadcrumb — just visual consistency)
- [ ] Verify: manual check, light and dark

## Phase 13 — `frontend/CLAUDE.md`

- [ ] Create `frontend/CLAUDE.md`, mirroring `backend/CLAUDE.md`'s tone/structure: what lives in `components/ui/` and when to reach for each primitive, the Token-vs-theme-variable naming rule (link `CONTEXT.md`), when Radix is warranted vs. hand-rolling (link ADR 0002), the light/dark theme-variable convention (never hardcode a raw Tailwind color like `slate-500` in feature code — reference a theme variable), the flat-folder-not-atomic-design rule, and a pointer to the two ADRs for the nav/IA decisions
- [ ] Leave a short "adding a new primitive" checklist (styled wrapper, variants via props not new components, a test file, an entry here) so this file stays current as the primitive set grows post-overhaul
- [ ] Verify: read it back as if you were a fresh agent with no other context — does it actually let you make the same calls this TODO made, without re-deriving them?

## Phase 14 — Full regression + manual verification

- [ ] `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build` all clean
- [ ] `cd backend && make check` green (Phase 5's touch)
- [ ] Manual pass, both themes: sign in → Projects → create/open a project → browse folders → open a video → select transcript text → add a comment → open the document panel → add a clip → format text → open Search (⌘F) from inside the video workspace → click a hit → confirm "Back to search" → open Ask from the header → ask a question → click a citation → confirm "Back to chat" → toggle the theme at various points and confirm nothing is illegible in either mode
- [ ] Confirm no leftover references to the deleted `SearchPage`/`icons.tsx`/`slate-*` ad hoc classes (a final grep for `slate-` and `text-slate` across `frontend/src` should turn up nothing outside of anything intentionally left, e.g. transitional third-party class names)
