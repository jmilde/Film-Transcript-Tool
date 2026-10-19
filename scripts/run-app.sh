#!/usr/bin/env bash
# Starts the API, worker, and frontend together through honcho (Procfile.dev);
# Ctrl+C stops all three. Assumes the database (local Docker or remote) is
# already up and migrated, and that backend/.env is configured.
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

echo "API http://localhost:8000/docs · Frontend http://localhost:5173 · Ctrl+C stops everything"
# -e /dev/null: the processes read their own .env files; honcho must not inject a root one.
exec honcho -f "$ROOT/Procfile.dev" -d "$ROOT" -e /dev/null start
