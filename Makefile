# Developer commands for the Film Transcript Tool.
#
# The Python backend (API + worker) lives in backend/; every target below runs
# uv there, so `make <target>` works from the repo root. uv manages the
# virtualenv and dependencies — no manual activation needed.
#
# Run `make` or `make help` to list the available targets.

BACKEND := backend
UV := cd $(BACKEND) && uv
FRONTEND := frontend

# Local Dockerized Postgres. Dev on 5442, test on 5443 — deliberately
# non-standard so they never collide with a system Postgres on 5432 or a
# tunnel to the real hosted Supabase instance. These env vars must be bound
# directly to the `uv run` invocation (after `cd $(BACKEND) &&`), not prefixed
# onto $(UV) — a prefix on $(UV) would bind to the `cd`, a shell builtin, and
# silently do nothing.
DEV_DB_URL := postgresql+psycopg://postgres:postgres@localhost:5442/postgres
TEST_DB_URL := postgresql+psycopg://postgres:postgres@localhost:5443/postgres

.DEFAULT_GOAL := help
.PHONY: help install db-up db-down db-wipe db-test-up db-test-down db-migrate \
	test test-all test-integration lint lint-fix format format-check typecheck check check-all \
	run-backend run-worker openapi fe-install run-frontend fe-build fe-lint fe-test fe-check

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Sync dependencies, including the dev group
	$(UV) sync

db-up: ## Start the local dev Postgres container (Docker, port 5442, persistent volume)
	docker compose up -d --wait db-dev

db-down: ## Stop the local dev Postgres container
	docker compose stop db-dev

db-wipe: ## Destroy ALL local dev Postgres data and recreate it fresh, migrated to head
	docker compose down -v db-dev
	docker compose up -d --wait db-dev
	$(MAKE) db-migrate

db-test-up: ## Start the local test Postgres container (Docker, port 5443, ephemeral)
	docker compose up -d --wait db-test

db-test-down: ## Stop the local test Postgres container
	docker compose stop db-test

db-migrate: ## Run Alembic migrations against the local dev Postgres container
	cd $(BACKEND) && DATABASE_URL_WORKER=$(DEV_DB_URL) uv run alembic upgrade head

test: db-test-up ## Run the test suite WITHOUT integration tests (no network/credentials needed)
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run alembic upgrade head
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run pytest -m "not integration"

test-all: db-test-up ## Run every test, including live integration tests (needs real credentials)
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run alembic upgrade head
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run pytest

test-integration: db-test-up ## Run only the live integration tests (needs real credentials)
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run alembic upgrade head
	cd $(BACKEND) && DATABASE_URL_WORKER=$(TEST_DB_URL) uv run pytest -m integration

lint: ## Check lint rules (ruff)
	$(UV) run ruff check .

lint-fix: ## Auto-fix lint violations where possible (ruff)
	$(UV) run ruff check --fix .

format: ## Auto-format the code in place (ruff)
	$(UV) run ruff format .

format-check: ## Verify formatting without modifying files (ruff)
	$(UV) run ruff format --check .

typecheck: ## Run the strict type checker (mypy)
	$(UV) run mypy app tests

check: lint format-check typecheck test ## Full offline quality gate: lint + format + types + tests (no integration)

check-all: lint format-check typecheck test-all ## Full quality gate INCLUDING live integration tests

run-backend: ## Run the FastAPI dev server with autoreload (http://localhost:8000)
	$(UV) run uvicorn app.main:app --reload

run-worker: ## Run the job-queue worker (polls Postgres, runs FFmpeg/Deepgram/translation jobs)
	$(UV) run python -m app.worker.runner

# --- Frontend (needs Node 20+; version pinned in frontend/.nvmrc) ---
# `nvm use` only switches PATH when a shell explicitly calls it — sourcing
# nvm.sh on shell startup does not apply it automatically. So each target
# below loads nvm and runs `nvm use` itself instead of relying on whatever
# node happens to already be on PATH.
NVM_USE := export NVM_DIR="$$HOME/.nvm"; \
	{ [ -s "$$NVM_DIR/nvm.sh" ] && . "$$NVM_DIR/nvm.sh"; } || { [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"; }; \
	command -v nvm >/dev/null 2>&1 && nvm use --silent

openapi: ## Regenerate the frontend typed API client from the backend OpenAPI schema
	cd $(FRONTEND) && $(NVM_USE) && npm run gen:api

fe-install: ## Install frontend dependencies
	cd $(FRONTEND) && $(NVM_USE) && npm install

run-frontend: ## Run the frontend dev server (Vite), matching run-backend/run-worker naming
	cd $(FRONTEND) && $(NVM_USE) && npm run dev

fe-build: ## Build the frontend for production
	cd $(FRONTEND) && $(NVM_USE) && npm run build

fe-lint: ## Lint the frontend (oxlint)
	cd $(FRONTEND) && $(NVM_USE) && npm run lint

fe-test: ## Run the frontend test suite (vitest)
	cd $(FRONTEND) && $(NVM_USE) && npm run test

fe-check: ## Full frontend gate: lint + typecheck + test + build
	cd $(FRONTEND) && $(NVM_USE) && npm run lint && npm run typecheck && npm run test && npm run build
