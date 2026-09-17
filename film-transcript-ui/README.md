# Film Transcript Tool — UI Bundle

All UI components, layouts, styles, and demo content from the Film Transcript Tool
(Deep Frost Studio design). No hosting/backend code included.

## What's inside
- `src/components/` — all UI components (header, folder tree, transcript panes, player card, comments, documents drawer, theme toggle, frost shell, plus shadcn primitives in `components/ui/`)
- `src/routes/` — page layouts: `index.tsx` (project overview) and `project/$videoId.tsx` (video detail)
- `src/styles.css` — full design token system (light + dark mode), glass surfaces, animations
- `src/lib/demo-data.ts` — static demo content (folders, transcripts, comments, docs)
- `src/assets/player-poster.jpg` — video player poster image

## Stack
React 19 + TanStack Router/Start, Tailwind CSS v4, lucide-react icons.
Fonts (Space Grotesk + Inter) are loaded via Google Fonts `<link>` tags in `src/routes/__root.tsx`.

## Use
Drop these files into a matching Vite + TanStack Start + Tailwind v4 project.
Install dependencies from `package.json`. Dark mode is class-based, toggled by
`components/theme-toggle.tsx` and persisted in localStorage.
