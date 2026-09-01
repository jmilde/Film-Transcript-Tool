# Local & Test Postgres via Docker — Implementation TODO

Persistent, git-tracked checklist for giving the backend two local, Dockerized
Postgres instances — one for automated tests, one for local development —
instead of both hitting the hosted Supabase Postgres. Stands alongside
`TODO.md` (read it and `backend/CLAUDE.md` and the repo-root `CLAUDE.md`
first — same rules apply: fully typed, `mypy --strict` clean, ruff clean,
test tree mirrors source tree, `make check` green at the end of every phase).

Confirmed decisions (do not re-litigate while implementing):
- **Auth is unchanged.** Supabase Auth stays exactly as-is — hosted, real
  JWKS verification in `app/core/auth.py`, real sign-in in the frontend via
  `@supabase/supabase-js`. This project does **not** remove or replace
  Supabase Auth. (That path was seriously considered and explicitly rejected
  — see git history on this file's introducing commit if the "why" is ever
  needed again.)
- **Supabase's role shrinks to "hosted Postgres in production" only.** Locally,
  Postgres moves entirely into Docker.
- **Two separate local Postgres instances, never shared**: one for `make
  test`/CI, one for local dev (`make run-backend`/`make run-worker`). Each
  gets its own container, port, and volume.
- **Tests already mock Supabase Auth fully** — `tests/core/test_auth.py`
  monkeypatches `auth._signing_key` (no real JWKS network call) and the
  `client`/`app_client`/`auth_client` fixtures in `tests/conftest.py` override
  `get_current_user` with a fake in-memory `User` (no real JWT). Nothing to
  build there — this checklist is purely about where the **database** lives.
- **No code changes to `tests/conftest.py`, `alembic/env.py`, or
  `app/core/auth.py`.** Both already resolve their Postgres URL from
  `get_settings().database_url_worker`; switching targets is purely an env
  var / `.env` change, not a code change.
  **Revised post-implementation:** `tests/conftest.py` did end up gaining a
  `pytest_configure` hook — a hard-abort safety check that refuses to run any
  test if `DATABASE_URL_WORKER` doesn't resolve to `localhost`/`127.0.0.1`.
  `make test`/`test-all`/`test-integration` already bind this var correctly,
  but `backend/.env` itself still legitimately points at hosted Supabase (for
  `make run-backend`/`run-worker`), so invoking `pytest` directly bypasses the
  Makefile's override and would otherwise silently run destructive tests
  against the real hosted DB. This guard exists specifically to prevent that.
- **Local dev auth flow**: a developer signs in through the real hosted
  Supabase Auth project (real email/password against real
  `SUPABASE_URL`/`SUPABASE_JWKS_URL`). The backend's existing
  just-in-time user provisioning in `get_current_user`
  (`app/core/auth.py`) creates the matching `User` row in the **local**
  dev Postgres on first authenticated request — this already works
  unmodified once `DATABASE_URL`/`DATABASE_URL_WORKER` point locally.
  No seed script needed for a first project: `POST /projects`
  (`app/api/routes/projects.py`) already grants the creating user an
  `OWNER` `ProjectMembership` automatically, so a fresh local dev can
  just create a project through the normal UI/API after logging in.
- **Image**: `pgvector/pgvector:pg16` for both containers (matches
  `pgvector>=0.5.0` in `backend/pyproject.toml`; the `vector` extension is
  still created via the existing Alembic migration, not a compose init
  script — `op.execute("CREATE EXTENSION IF NOT EXISTS vector")` already
  exists from the semantic-search work).
- **Ports**: dev on `5442`, test on `5443` — deliberately non-standard so
  they don't collide with a system-installed Postgres on `5432` or with
  anyone tunneling to the real Supabase instance on `5432`/`6543`.

---

## Phase 1 — Docker Compose for local Postgres
- [x] Add a repo-root `docker-compose.yml` with two services:
  - `db-dev`: `pgvector/pgvector:pg16`, `POSTGRES_PASSWORD=postgres`,
    `POSTGRES_DB=postgres`, port `5442:5432`, named volume
    `pgdata-dev:/var/lib/postgresql/data` (persistent — a dev's local data
    should survive `docker compose down`), healthcheck via `pg_isready -U
    postgres`.
  - `db-test`: same image/credentials, port `5443:5432`, **no** named volume
    (anonymous/ephemeral storage is fine — tests always roll back and the
    schema is rebuilt by migrations each run), same healthcheck.
- [x] Add a `.dockerignore`/note only if `docker compose build` ever
  applies here — it doesn't (both services use the stock upstream image,
  no repo Dockerfile needed for this checklist).
- [x] Verify: `docker compose up -d --wait` brings both containers to
  healthy; `psql postgresql://postgres:postgres@localhost:5442/postgres -c
  '\dt'` and the `:5443` equivalent both connect. (No local `psql` client
  available; verified equivalently via `docker exec ... psql -U postgres -c
  '\dt'` against both containers.)

## Phase 2 — Makefile wiring
- [x] Add targets to the repo-root `Makefile` (near the existing `install`/
  `test` targets, following the file's existing `## comment` help-string
  convention):
  - `db-up` — `docker compose up -d --wait db-dev`
  - `db-down` — `docker compose stop db-dev`
  - `db-test-up` — `docker compose up -d --wait db-test`
  - `db-test-down` — `docker compose stop db-test`
  - `db-migrate` — runs `alembic upgrade head` against `db-dev`
    (`DATABASE_URL_WORKER=postgresql+psycopg://postgres:postgres@localhost:5442/postgres`
    prefixed onto `$(UV) run alembic upgrade head`)
- [x] Change `test`, `test-all`, `test-integration` to depend on `db-test-up`
  and to run with `DATABASE_URL_WORKER` overridden to the `:5443` test
  container, migrated to head first.

  **Careful with `$(UV)`**: it expands to `cd backend && uv`. A prefixed env
  var on a line like `DATABASE_URL_WORKER=... $(UV) run pytest` binds to
  `cd backend` (a no-op for env purposes, since `cd` is a shell builtin), not
  to `uv` after the `&&` — so the override silently does nothing and the
  test would fall back to whatever `DATABASE_URL_WORKER` is in
  `backend/.env` (the hosted Supabase DB), defeating the entire point of
  this checklist without erroring. The env var must be bound directly to the
  `uv` invocation, after the `cd`:
  ```makefile
  TEST_DB_URL := postgresql+psycopg://postgres:postgres@localhost:5443/postgres

  test: db-test-up ## Run the test suite WITHOUT integration tests (no network/credentials)
  	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run alembic upgrade head
  	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run pytest -m "not integration"
  ```
  Apply the equivalent pattern (not the `$(UV)` macro) to `test-all` and
  `test-integration`. Same caution applies to the `db-migrate` target in the
  item above — write it the same way, not via `$(UV)` with a prefix.
  Real environment variables already take precedence over `backend/.env` in
  `pydantic-settings`'s `BaseSettings` (library default) — this only matters
  once the env var is actually reaching the `uv run` process, per the fix
  above.
- [x] `check`/`check-all` need no changes — they already just depend on
  `test`/`test-all`, which now bring up and migrate the test DB themselves.
- [x] Verify — and make this verification actually distinguish "hitting
  Docker" from "silently falling back to Supabase," not just "passes
  offline": temporarily set a garbage `DATABASE_URL_WORKER` in
  `backend/.env` (or otherwise make the hosted Supabase DB unreachable) and
  confirm `make test` still passes — that proves the override in the
  Makefile is actually reaching the test run, not just that the network
  happened to be up. Only after that, confirm the general case: from a
  machine with **no `backend/.env` file at all** except the
  `SUPABASE_*`/`DEEPGRAM_API_KEY`/`OPENROUTER_API_KEY` placeholders
  `Settings` requires to construct, `make check` passes fully offline —
  confirms the "no network/credentials needed" claim in `make help`'s
  `test` description is finally true.
- [x] No CI currently exists in this repo (no `.github/workflows` or
  equivalent) — this checklist deliberately does not add one. If CI is
  introduced later, it will need its own `db-test`-equivalent (a Postgres
  service block, or `docker compose up` in a setup step) before `make
  check` can run there; out of scope here.

## Phase 3 — Backend config & docs updates
- [x] `backend/.env.example`: change the `DATABASE_URL`/`DATABASE_URL_WORKER`
  example values to point at the local `db-dev` container (`localhost:5442`)
  by default, with a comment explaining these can instead point at a hosted
  Supabase project's pooler/direct ports if someone wants to develop against
  real hosted data. Leave `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/
  `SUPABASE_JWKS_URL` as real-hosted-project placeholders, unchanged —
  those still always point at the real Supabase Auth project.
- [x] `backend/CLAUDE.md`, "Tests" section: replace "Tests run against the
  real Supabase Postgres" with an accurate description of the local
  Dockerized test Postgres and the `make test`-driven migrate-then-run
  flow. Keep the existing note about the `FOR UPDATE SKIP LOCKED` claim-race
  test using its own engine/explicit cleanup — that's DB-agnostic and still
  true.
- [x] Root `README.md`: update the "Docker" / local-dev-setup section (it
  already lists Docker/Docker Compose and Supabase as prerequisites) to
  describe the actual flow: `docker compose up -d --wait db-dev`, copy
  `backend/.env.example` → `backend/.env`, fill in real Supabase Auth
  project credentials, `make db-migrate`, `make run-backend` / `make
  run-worker`, sign in via the frontend against the real Supabase project,
  create a first project through the UI (grants `OWNER` membership
  automatically — no seeding required).
- [ ] Verify: a fresh clone, following only the updated README steps with a
  real Supabase Auth project's credentials (no hosted Postgres access
  needed at all), reaches a working local app with the ability to sign in,
  create a project, and use it. **Outstanding** — needs a human at a browser
  with real Supabase Auth credentials; covered by the Phase 4 manual step
  below, still unchecked for the same reason.
- [x] `docs/300_architecture.md` §15 "Docker Deployment": this section
  already describes a Docker Compose dev stack with `frontend`/`backend`/
  `worker`/`database` services — none of which existed before this
  checklist. Add a short note that only the `database` piece is
  containerized so far (this checklist), and that `frontend`/`backend`/
  `worker` still run on the host via the `Makefile` (`make run-backend`,
  `make run-worker`, `make run-frontend`), matching the "docs are the spec, keep
  them from drifting" convention this repo already follows (see
  `TODO_SEMANTIC_SEARCH.md` Phase S7 for precedent on reconciling a
  doc/implementation gap once a phase closes it).

## Phase 4 — Full verification
- [x] `make check` green with the new Docker-backed `test` target.
- [x] `make check-all` green (integration tests still need real
  `DEEPGRAM_API_KEY`/`OPENROUTER_API_KEY` credentials, per existing
  behavior — unrelated to this change; just confirm nothing here broke it).
- [x] Confirm `tests/db/test_migrations.py`'s table-existence checks still
  pass against a freshly-migrated `db-test` container.
- [ ] Manual: run `make db-up db-migrate run-backend` plus `make run-frontend`,
  sign in with a real Supabase Auth account in the browser, confirm a
  `User` row appears in the **local** `db-dev` Postgres (not the hosted
  one) after first login, create a project, confirm it persists across a
  `docker compose restart db-dev`.
