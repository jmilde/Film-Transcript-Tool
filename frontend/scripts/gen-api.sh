#!/usr/bin/env bash
# Regenerate the typed API client from the backend's OpenAPI schema.
#
# Dumps the schema straight from the FastAPI app factory (no running server
# needed), then runs openapi-typescript over it. Run from the frontend dir:
#   npm run gen:api
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend="$here/../backend"

echo "Dumping OpenAPI schema from the backend app factory..."
( cd "$backend" && uv run python -c "import json, app.main as m; print(json.dumps(m.app.openapi()))" ) > "$here/openapi.json"

echo "Generating src/api/schema.d.ts..."
( cd "$here" && npx openapi-typescript openapi.json -o src/api/schema.d.ts )

echo "Done."
