# Frost reskin — implementation TODO

Persistent, git-tracked task checklist for restyling the frontend to
match the "Deep Frost Studio" look pasted into `film-transcript-ui/`
(a Lovable-generated mockup: frosted glass panels, blur, a floating
gradient-blob background, rounder corners, a Space Grotesk display
face for headings/micro-labels, uppercase-tracked section labels).
Mirrors the style of `TODO_FRONTEND_OVERHAUL.md` — read that file's
"Confirmed decisions" section and `frontend/CLAUDE.md` first; this
reskin must not violate the conventions established there.

Any agent picking this up should work top to bottom and check items
off (edit this file and commit) as they land.

## Source material — read, don't copy

`film-transcript-ui/` is reference-only. It's a separate, throwaway
Vite/TanStack-Router app pasted in wholesale for its visual language,
not code to import from or build:

- `src/styles.css` — the "Deep Frost Studio" theme (`frost-*` CSS
  vars, `.frost-glass`/`.frost-glass-strong`/`.frost-bg`/`.frost-blob`
  classes, light + dark value blocks)
- `src/components/app-header.tsx`, `frost-shell.tsx` — shell/header
  treatment
- `src/components/transcript-pane.tsx`, `player-card.tsx`,
  `comments-card.tsx`, `documents-drawer.tsx`, `folder-tree.tsx` —
  per-feature visual targets for Pass 2
- `src/lib/demo-data.ts` — fake data only, ignore

**Do not port its code directly.** It hardcodes raw rgba/hex colors
with no dark-mode wiring, uses a different router, and doesn't go
through theme variables at all — copying it verbatim would violate
`frontend/CLAUDE.md`'s "every color resolves through a theme variable,
never a raw color" rule. Port the *ideas* (glass panels, rounding,
blob background, display type, micro-label style) into our existing
`--raw-*` / `.dark`-class theme-variable mechanism so both themes keep
working.

## Confirmed decisions (do not re-litigate while implementing)

- **Full reskin**, both light and dark — not a selective/subtle
  adoption. Built on our existing theme-variable infrastructure
  (`index.css`'s `--raw-*` vars + `.dark` overrides + `@theme inline`
  mapping), never as new hardcoded colors.
- **Add Space Grotesk** as a second, display-only typeface
  (self-hosted via `@fontsource-variable/space-grotesk`, same pattern
  as the existing `@fontsource-variable/inter`) for headings, the app
  wordmark, and uppercase-tracked section micro-labels. Body copy
  stays Inter — this is additive, not a full font swap.
- **Glassmorphism, fully adopted**: translucent blurred panels,
  rounder corners (extend the radius scale), and a decorative animated
  gradient/blob background behind the app shell. Blob colors must come
  from existing `brand`/`info` theme vars (`getComputedStyle` or
  Tailwind classes), not new hardcoded hex, so they retint with `.dark`
  automatically.
- **Semantic color meaning is untouched.** brand = selection/primary
  action, info = active/now-playing, warning = search match /
  unresolved comment, success = resolved, danger = destructive. This
  reskin changes surfaces/shape/type, not what a color means.
- **Dense workspace stays neutral.** Per `frontend/CLAUDE.md`, the
  editing workspace (`VideoWorkspace` and everything docked in it)
  keeps color reserved for meaning — it gets the glass/blur/rounding
  treatment like everywhere else, but not tinted panels. Airy pages
  (Projects/Search/Chat) are where tinted glass is allowed.
- **Two passes**, sequenced so the second can lean on the first:
  - **Pass 1 — shared primitives + shell.** Everything else inherits
    this for free (`Button`, `Card`, `Input`, `Badge` are used
    everywhere). Land this, then do a visual pass over every existing
    page/feature to see what already looks right by inheritance before
    touching anything bespoke.
  - **Pass 2 — feature-specific follow-up.** Hand-touch the
    components that need more than what inheriting Pass 1's primitives
    gives them (transcript panes, player chrome, comments, folder
    tree, document panel drawer).
- No behavior changes in either pass — pure visual/markup, same as
  Phases 10/11 of the original overhaul.

---

## Pass 1 — Shared primitives + shell

### Phase 1 — Dependencies & theme tokens

- [ ] `cd frontend && npm install @fontsource-variable/space-grotesk`
- [ ] `frontend/src/index.css`: import it the same way Inter is
      imported, add a `--font-display` variable in the `@theme inline`
      block (e.g. `'Space Grotesk Variable', ui-sans-serif, ...`)
- [ ] Add glass-surface raw vars for both `:root` and `.dark`, named
      to fit the existing `--raw-*` convention (e.g. `--raw-glass`,
      `--raw-glass-strong`, `--raw-glass-line`), with values mirroring
      the mockup's `frost-panel`/`frost-panel-strong`/`frost-line`
      light/dark pairs — translucent whites in light, translucent
      low-opacity whites in dark. Map them in `@theme inline` to
      `--color-glass`, `--color-glass-strong`, `--color-glass-line` so
      they're usable as `bg-glass`, `bg-glass-strong`,
      `border-glass-line` Tailwind classes.
- [ ] Extend the radius scale (`--radius-lg`/add `--radius-xl`/
      `--radius-2xl`) for the rounder card/button/panel language.
- [ ] Add a decorative background: a gradient utility class (e.g.
      `.app-bg`, built from existing `page`/`brand-subtle`-style theme
      vars, not new hex) plus a `frost-float`-equivalent `@keyframes`
      + `--animate-*` var for the blobs (follow the existing pattern
      of hand-defined `@keyframes` already in this file for
      fade/scale/slide — no animation library).
- [ ] Verify: toggle the `dark` class on `<html>` via devtools and
      confirm the new glass vars flip correctly; no console errors;
      `npm run typecheck` clean (no component changes yet).

### Phase 2 — `Button` primitive

- [ ] `frontend/src/components/ui/Button.tsx`: round the shared base
      class (`rounded-md` → the new larger radius) and re-skin
      `secondary`/`ghost` to a translucent glass-panel look
      (`bg-glass`/`bg-glass-strong` + `backdrop-blur` + an outline
      using `border-glass-line`) instead of the current flat
      bordered style. `primary`/`destructive` stay solid, just rounder
      and with `shadow-sm`. Variant prop API (`primary` / `secondary`
      / `ghost` / `destructive`) must not change — no call sites should
      need touching.
- [ ] `Button.test.tsx`: confirm existing assertions (role/variant/
      disabled state) still pass; they should, since tests target
      behavior/props, not raw class strings — fix if any do.
- [ ] Verify: `npm run test -- Button`, `npm run typecheck`.

### Phase 3 — `Card` primitive

- [ ] `frontend/src/components/ui/Card.tsx`: `dense` variant becomes a
      neutral glass-strong panel (`bg-glass-strong` + `backdrop-blur`
      + `border-glass-line`, new rounded-xl radius) — **no tint**,
      preserving the "dense = color reserved for meaning" rule.
      `airy` variant becomes a tinted glass panel: layer the existing
      `tint` background under `backdrop-blur`, bump to the new
      rounded-2xl radius, keep `shadow-sm`.
- [ ] `Card.test.tsx`: update/verify variant assertions.
- [ ] Verify: `npm run test -- Card`.

### Phase 4 — `Input`, `Textarea`, `Badge`

- [ ] `frontend/src/components/ui/Input.tsx` (and `Textarea.tsx`):
      replace the hard `border border-border` treatment with a glass
      background (`bg-glass`) + outline, keep the `focus:border-brand`
      (or switch to an outline-based focus ring, whichever reads
      better against the translucent background) — check contrast in
      both themes once the blob background is in place behind it.
- [ ] `frontend/src/components/ui/Badge.tsx`: pill shape/semantics
      unchanged; check whether the mockup's uppercase-tracked
      micro-label feel is worth a small `tracking-wide` tweak, or
      whether that's better reserved for section headers (Phase 5)
      rather than status pills — use judgment, this one's minor.
- [ ] Update `Input.test.tsx`/`Textarea.test.tsx`/`Badge.test.tsx` if
      any class-coupled assertions break.
- [ ] Verify: `npm run test`.

### Phase 5 — `AppShell`: shell & header reskin

- [ ] `frontend/src/components/AppShell.tsx`: wrap the shell in the
      Phase 1 gradient background, with 2–3 decorative blurred blob
      `<div>`s (`aria-hidden="true"`, `pointer-events-none`,
      absolutely positioned, animated via Phase 1's keyframes,
      colored from `brand`/`info` theme vars) behind a
      `position: relative` content wrapper. Contain them with
      `overflow-hidden` on the outer shell so they don't cause page
      scroll.
- [ ] Header becomes a blurred glass bar: `bg-glass-strong
      backdrop-blur border-b border-glass-line` in place of
      `bg-surface border-border`.
- [ ] Add a small accent-colored rounded icon mark next to the
      wordmark (e.g. `lucide-react`'s `Clapperboard`, already a
      dependency, in a `bg-brand` rounded box — matches the mockup's
      `app-header.tsx`); set the wordmark text in `font-display`.
- [ ] Optional: set `Breadcrumb`'s current (bold) item in
      `font-display` for a bit more of the mockup's typographic
      character — judgment call, skip if it reads oddly at breadcrumb
      sizes.
- [ ] `AppShell.test.tsx`: confirm the decorative blobs don't leak
      into the accessible tree (they're `aria-hidden`, so existing
      role-based queries should be unaffected) — add a quick assertion
      if there's an easy way to confirm `aria-hidden` is present, not
      required if existing tests already pass untouched.
- [ ] Verify: `npm run lint && npm run typecheck && npm run test &&
      npm run build`. Then run the dev server and manually load every
      existing page (Projects, ProjectView, VideoWorkspace, Chat,
      SignIn) in both light and dark — confirm nothing is illegible
      against the new blurred background purely from inheriting Pass
      1's primitives, and **note** (for Pass 2) any surface that looks
      obviously unfinished or low-contrast.

---

## Pass 2 — Feature-specific follow-up

Start only after Pass 1 has landed and been visually reviewed — that
review determines which of these actually need bespoke work versus
already looking right from inheriting the Pass 1 primitives. Treat
each bullet as "audit, then reskin if it doesn't already look right,"
not "definitely rewrite."

- [ ] `frontend/src/features/transcript/TranscriptViewer.tsx`: glass
      panel treatment per pane (mirrors the mockup's
      `transcript-pane.tsx`) — uppercase-tracked mini-label pane
      header, glass search input (should mostly fall out of Phase 4's
      `Input` if this component already uses it; check), active-token
      highlight stays on the existing `info` semantic var (don't
      change the meaning, only the surrounding chrome).
- [ ] `frontend/src/features/player/VideoPlayer.tsx`,
      `PlayerControls.tsx`, `Waveform.tsx`: player chrome as a
      glass-strong rounded-2xl card (mirrors `player-card.tsx`).
      `Waveform.tsx` reads raw theme vars via `getComputedStyle` for
      its canvas fill — re-check contrast of played/unplayed bars once
      sitting on a glass panel instead of a flat surface; extend the
      set of vars it reads if needed, don't hardcode a canvas color.
- [ ] `frontend/src/features/comments/CommentsPanel.tsx`: glass-strong
      card, avatar-initials chip styling (mirrors `comments-card.tsx`);
      Resolve action keeps the `success` semantic, unresolved keeps
      `warning` — per the existing mapping in `frontend/CLAUDE.md`,
      unchanged.
- [ ] `frontend/src/features/folders/FolderTree.tsx`,
      `FolderPanel.tsx`: glass sidebar panel; active-folder/active-row
      tint reuses the existing `brand-subtle` var (already matches the
      mockup's `frost-accent/10` pattern conceptually — just confirm
      it still reads well once the panel itself is translucent).
- [ ] `frontend/src/features/documents/DocumentPanel.tsx`,
      `DocumentTabStrip.tsx`: drawer-style glass panel (mirrors
      `documents-drawer.tsx`) — search input, new-document row,
      hover-reveal delete affordance on each doc row.
- [ ] `frontend/src/features/toolbar/SelectionToolbar.tsx` and the
      Radix-backed popovers (`MembersPanel`, `TranslationControl`,
      `ExportControl`, the document switcher `Select`): once their
      trigger buttons inherit Pass 1's `Button`, check whether the
      popover/dialog *content* shells (currently `bg-surface`) need a
      glass background too for visual consistency, or whether a solid
      surface reads better for a floating overlay — this is a judgment
      call, not automatic.
- [ ] No new `ThemeToggle` component needed — `AppShell` already has a
      theme-toggle `Button` wired to `useThemeStore`, unlike the
      mockup's standalone one.
- [ ] Update any per-component test files whose assertions are coupled
      to markup/classes that changed.
- [ ] Verify: full manual walk-through in both themes — sign in →
      Projects → create/open a project → browse folders → open a
      video → select transcript text → add a comment → open the
      document panel → add a clip → format text → open the
      Translation/Export popovers → open Search (⌘F) → open Ask/Chat.
      Then run a final
      `grep -rE "slate-|gray-|zinc-|neutral-|amber-|violet-|red-|sky-|teal-|orange-|yellow-|emerald-|text-white|bg-white" frontend/src`
      (mirrors the check the original overhaul ended each reskin phase
      with) — should stay clean.

## Cleanup

- [ ] Once Pass 2 is reviewed and merged, delete the
      `film-transcript-ui/` reference directory (its only job was
      supplying the visual target) — confirm with whoever's driving
      first, in case it's still wanted for a further round.
- [ ] If any new lasting convention fell out of this work (the `glass`
      theme variables, the display-font usage rule, radius scale
      additions), add it to `frontend/CLAUDE.md` so the next person
      doesn't have to re-derive it from this TODO.
