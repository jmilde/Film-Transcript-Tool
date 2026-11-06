#!/usr/bin/env bash
# Starts the API, worker, and frontend together through honcho (Procfile.dev);
# Ctrl+C stops all three. Assumes backend/.env is configured. If it points at
# the local Docker dev DB, that container is started and migrated first;
# any other database must already be up (a pending migration only warns).
set -eo pipefail  # no -u: nvm.sh reads unset variables

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/backend/.env" ]; then
  echo "Missing backend/.env — copy backend/.env.example to backend/.env and fill it in first." >&2
  exit 1
fi

# Mirrors the Makefile's NVM_USE: `nvm use` in this shell puts the pinned Node
# on PATH, which honcho and the `web` process inherit.
export NVM_DIR="$HOME/.nvm"
{ [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; } || { [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"; } || true
if command -v nvm >/dev/null 2>&1; then
  cd "$ROOT/frontend" && nvm use --silent && cd "$ROOT"
fi

(cd "$ROOT/backend" && uv sync --quiet)
export PATH="$ROOT/backend/.venv/bin:$PATH"

# Database preflight. Without it, a stopped Postgres or an unapplied migration
# only shows up as "Could not load projects." in the browser (plus misleading
# CORS errors in its console). Only host:port is printed, never credentials.
DB_HOSTPORT="$(cd "$ROOT/backend" && python -c 'from app.config import get_settings; from sqlalchemy.engine import make_url; u = make_url(get_settings().database_url_worker); print(f"{u.host}:{u.port}")')"
case "$DB_HOSTPORT" in
  localhost:5442 | 127.0.0.1:5442)
    # The local Docker dev DB (`make db-up`): safe to start and migrate here.
    echo "Starting local dev Postgres ($DB_HOSTPORT) and applying migrations…"
    (cd "$ROOT" && docker compose up -d --wait db-dev)
    (cd "$ROOT/backend" && alembic upgrade head)
    ;;
  *)
    # Anything else (e.g. hosted Supabase) is never migrated implicitly — just
    # fail fast if it's unreachable and warn if it's behind.
    if ! CURRENT="$(cd "$ROOT/backend" && alembic current 2>/dev/null | awk '{print $1}')"; then
      echo "Cannot reach the database at $DB_HOSTPORT — is it running?" >&2
      exit 1
    fi
    HEADS="$(cd "$ROOT/backend" && alembic heads 2>/dev/null | awk '{print $1}')"
    if [ "$CURRENT" != "$HEADS" ]; then
      echo "WARNING: database at $DB_HOSTPORT is not at the latest migration ($CURRENT vs $HEADS) — run \`make migrate\`." >&2
    fi
    ;;
esac

echo "API http://localhost:8000/docs · Frontend http://localhost:5173 · Ctrl+C stops everything"
# -e /dev/null: the processes read their own .env files; honcho must not inject a root one.
exec honcho -f "$ROOT/Procfile.dev" -d "$ROOT" -e /dev/null start
