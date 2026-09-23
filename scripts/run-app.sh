#!/usr/bin/env bash
# Starts the backend, worker, and frontend together and stops all three on
# Ctrl+C. Assumes the database (local Docker or remote) is already up and
# migrated, and that backend/.env / frontend deps are already configured.

cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  echo "Missing backend/.env — copy backend/.env.example to backend/.env and fill it in first." >&2
  exit 1
fi

# Mirrors the Makefile's NVM_USE: sourced inline so `nvm use` applies to the
# same subshell that then runs `npm run dev`.
NVM_SETUP='export NVM_DIR="$HOME/.nvm"; { [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; } || { [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"; }; command -v nvm >/dev/null 2>&1 && nvm use --silent'

cleanup() {
  echo ""
  echo "Stopping backend, worker, and frontend..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd backend && uv run uvicorn app.main:app --reload 2>&1 | sed -u 's/^/[backend]  /') &
(cd backend && uv run python -m app.worker.runner 2>&1 | sed -u 's/^/[worker]   /') &
(cd frontend && bash -c "$NVM_SETUP; npm run dev" 2>&1 | sed -u 's/^/[frontend] /') &

echo "Starting backend (http://localhost:8000), worker, and frontend (http://localhost:5173)..."
echo "Press Ctrl+C to stop everything."
wait
