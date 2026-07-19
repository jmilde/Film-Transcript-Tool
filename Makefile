# Developer commands for the Film Transcript Tool.
#
# The Python backend (API + worker) lives in backend/; every target below runs
# uv there, so `make <target>` works from the repo root. uv manages the
# virtualenv and dependencies — no manual activation needed.
#
# Run `make` or `make help` to list the available targets.

BACKEND := backend
UV := cd $(BACKEND) && uv

.DEFAULT_GOAL := help
.PHONY: help install test test-all test-integration lint lint-fix format format-check typecheck check check-all

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Sync dependencies, including the dev group
	$(UV) sync

test: ## Run the test suite WITHOUT integration tests (no network/credentials)
	$(UV) run pytest -m "not integration"

test-all: ## Run every test, including live integration tests (needs real credentials)
	$(UV) run pytest

test-integration: ## Run only the live integration tests (needs real credentials)
	$(UV) run pytest -m integration

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
