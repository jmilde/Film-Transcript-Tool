# Frontend — Film Transcript Tool

React + TypeScript + Vite SPA that talks only to the backend API. Server state is
managed with TanStack Query; local UI state with zustand; auth via Supabase.

## Requirements

- **Node 20+** (developed on Node 22 LTS). With nvm: `nvm use` (reads `.nvmrc`).

## Setup

```bash
nvm use            # Node 22
npm install
cp .env.example .env   # fill in VITE_SUPABASE_* and VITE_API_URL
npm run gen:api        # regenerate src/api/schema.d.ts from the backend
npm run dev            # http://localhost:5173
```

The backend must be running (default `http://localhost:8000`) and have CORS
allowing the dev origin (it does by default). Sign in with a Supabase user that
is also a member of at least one project to see data.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run test` | Vitest (jsdom + Testing Library + MSW) |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` |
| `npm run format` / `format:check` | Prettier |
| `npm run gen:api` | Dump the backend OpenAPI schema and regenerate the typed client |

Root `Makefile` mirrors these as `fe-*` targets (`make fe-check`, `make openapi`, …).

## Structure

```
src/
  api/        generated schema + openapi-fetch client + Query hooks
  auth/       Supabase client, AuthProvider/context, RequireAuth guard
  app/        Query client, router
  pages/      SignIn, Projects (route screens)
  components/ AppShell (nav + workspace)
  store/      zustand UI-state stores (added as features land)
  test/       MSW server + Vitest setup
```
