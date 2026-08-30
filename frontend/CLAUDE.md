# Frontend conventions

Guidance specific to the `frontend/` package. The repo-root `CLAUDE.md` and `docs/` still apply; this file adds frontend-only rules. Read `CONTEXT.md` and `docs/adr/0001-search-overlay-chat-route.md` / `docs/adr/0002-radix-for-overlays-only.md` before touching navigation or `components/ui/` — they're the "why" behind decisions this file states as fact.

## Commands

Run from `frontend/` (or via the repo-root `Makefile`'s `fe-*`/`run-frontend` targets — see `make help`):

- `npm run test` — vitest, single run; `npm run test:watch` for watch mode
- `npm run typecheck` — `tsc -b`
- `npm run lint` — oxlint
- `npm run format` / `npm run format:check` — prettier, write / check only
- `npm run build` — `tsc -b && vite build`
- `npm run gen:api` — regenerate `src/api/schema.d.ts` from the backend's live OpenAPI schema (no server needed — dumps straight from the FastAPI app factory); run this after any backend schema change before touching frontend code that depends on it
- `npm run dev` — Vite dev server

There's no single "check everything" script here (unlike the backend's `make check`) — run `lint`, `typecheck`, `test`, and `build` individually, in that order, before considering frontend work done.

## `components/ui/` — the primitives layer

Flat folder, no atomic-design taxonomy (no `atoms/`/`molecules/`/`organisms/` split) — this is a project-sized app, not a design-system product, and a taxonomy earns its keep only once a folder gets big enough to need one. If it ever does, restructure then; don't pre-build the shelving for books you don't have yet.

Two kinds of primitive live here, split on one question: **is correct behavior hard to get right by hand?**

- **Hand-rolled** (`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Breadcrumb`): thin Tailwind wrappers over Phase 1's theme variables, no runtime dependency beyond React. Reach for these whenever you need a styled interactive element, a content container, or a status pill — they take variants via props, not via new components (a `variant="destructive"` prop, not a `DestructiveButton`).
- **Radix-backed** (`Dialog`, `Popover`, `Tooltip`, `DropdownMenu`, `Select`, `CommandPalette`): unstyled `@radix-ui/react-*` primitives underneath, styled shell on top. Per ADR 0002, these five (plus the `CommandPalette` built from `Dialog`) are the only ones — everything else that looks like it needs a popup should compose one of them rather than growing its own `useState` + `absolute`-positioned `<div>`. If you find a hand-rolled popover/modal elsewhere in the codebase missing focus-trap, Escape-to-close, or outside-click-to-close, that's a bug, not a style choice — migrate it (see the Phase 10/11 `MembersPanel`/`TranslationControl`/`ExportControl` migrations in `TODO_FRONTEND_OVERHAUL.md` for the pattern: `Popover` for the shell, `Select` for any native `<select>` inside it, unless the interaction is genuinely a fixed 2-3-option native picker with no test cost to preserve — a native `<select>` is not automatically wrong).

Not every popup needs Radix. A component is a legitimate hand-rolled exception only if it's simpler than the Radix wrapper would be *and* doesn't need focus-trap/Escape/outside-click. If you're unsure, default to the Radix primitive — the failure mode of skipping it (silently missing keyboard/a11y behavior) is worse than the failure mode of using it unnecessarily (a few extra props).

### Adding a new primitive

1. Styled wrapper over the relevant theme variables (colors/radius/type from `index.css`'s `@theme` block) — no ad hoc Tailwind color/spacing values.
2. Variants via props, not new components.
3. A test file (`Name.test.tsx`) covering variants/states via RTL — for a Radix-backed one, prove focus-trap/Escape/outside-click are wired (Radix provides the behavior; the test proves it's wired, not re-testing Radix itself).
4. An entry in this file's list above, in the hand-rolled or Radix-backed group as appropriate.

## Token vs. theme variable

**Token** is a transcript term (`docs/400_database.md`) — the smallest editable unit of a transcript, with `original_text`/`edited_text`/`is_deleted`. Never use "token" for anything in the design system. **Theme variable** is this layer's term for a reusable style value (color, spacing, radius, type scale). Never say "design token" — it collides with the transcript meaning. See `CONTEXT.md` for the canonical definitions.

## Light/dark theme-variable convention

Every color in feature code must resolve through a theme variable class (`bg-surface`, `text-text-muted`, `border-border`, `bg-brand-subtle`, …) — never a raw Tailwind color (`slate-500`, `red-600`, `bg-white`) and never a hardcoded hex/rgb value in a `style` prop. Raw colors don't flip with `.dark` on `<html>`, so they silently break in whichever theme wasn't being looked at when the code was written.

The one legitimate exception is media chrome sitting *on top of* arbitrary video content (e.g. a close button overlaying a video preview, or a canvas waveform's playhead/bars) — those aren't part of the app's themed surface, so a deliberate fixed color (or, for canvas, a value read from the theme's raw CSS custom properties via `getComputedStyle`, as `Waveform.tsx` does) is correct. Don't use this as a loophole for panel/card/button colors — if it's app chrome, it's themed.

Semantic color mapping (established across the editing workspace in Phase 11 — reuse it rather than inventing a new meaning for the same hue elsewhere):

- **brand** — selection / an in-progress edit / the primary interactive action.
- **info** — the active/now-playing item (ambient "this is where we are," not urgent).
- **warning** (solid) — the current search match; **warning-subtle** — other matches; also the unresolved-comment underline and the Comment button's `highlight` variant.
- **success** — the resolved-comment underline and the Resolve action.
- **danger** — destructive actions and error states.

`Card`/`Badge` take a `variant`/`tint` prop rather than hardcoded classes at the call site — airy pastel tint on browsing pages (`Projects`, the search overlay, `Chat`), dense/neutral on the editing workspace (`VideoWorkspace` and everything docked in it). Color is reserved for meaning in the dense variant; the airy variant's pastel cards are the one place decoration is allowed, and even there it's limited to the brand hue + the semantic set (no invented decorative hues).

## Navigation / IA

The global header (`AppShell.tsx`) derives its breadcrumb purely from route params (`useParams` at the layout-route level) plus `useProject`/`useVideo` — there is no separate "current project" navigation store. `store/documentPanel.ts`'s `activeProjectId` is a different concept (which project the persistent document panel operates on) and must stay that way; don't fold breadcrumb state into it or vice versa.

Search is a global command-palette overlay (⌘F, `store/searchOverlay.ts` + `SearchCommandPalette.tsx`), not a route — see ADR 0001 for why, and note the overlay store deliberately holds only `isOpen`/`query`, never results (TanStack Query's cache already does that job). Chat stayed a dedicated route for the same reason (ADR 0001). `PendingSearchNav`'s `origin: 'search' | 'chat'` discriminant is what lets `VideoWorkspace`'s `ReturnToOrigin` affordance know whether to reopen the overlay or navigate to a real URL — extend that discriminated union rather than adding a third ad hoc shape if a new origin ever shows up.

## Server state vs. local UI state

TanStack Query owns server state (projects, videos, transcripts, comments, search results). Zustand stores (`store/*.ts`) own local UI state (selection, panel layout, playback position, theme, the search overlay's open/query). Don't cross the streams — a store should never cache API response data TanStack Query already caches, and a query should never hold UI-only state like "is this panel open."
