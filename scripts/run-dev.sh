#!/usr/bin/env bash
#
# Dev flow: Dashboard only, no pipeline.
# - Uses workspace documentation/ and slides/ directly.
# - Skips Agent 1 (doc generator) and Agent 2 (module/slide generators).
# - Backend and frontend run locally. No GCP.
#
# Prerequisites: Populate documentation/ and slides/ in the project root.
# Usage: ./scripts/run-dev.sh

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Activate venv if present
if [ -d "$ROOT/.venv" ]; then
  source "$ROOT/.venv/bin/activate"
fi

echo "=== CodeStory Dev flow ==="
echo "  Backend:  local (no GCP), content from documentation/ and slides/"
echo "  Frontend: local, starts at dashboard (skips pipeline)"
echo ""

# Start backend in background (no GCS → local disk only)
export GCS_BUCKET=
export GOOGLE_CLOUD_PROJECT=
echo "Starting backend on http://localhost:8081 (WebSocket on 8080)..."
python3 app/server.py &
BACKEND_PID=$!
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

# Wait for backend to bind
sleep 2

# Start frontend (dev mode → dashboard first)
cd "$ROOT/app"
export VITE_DEV_SKIP_PIPELINE=true
export VITE_API_BASE=http://localhost:8081
echo "Starting frontend at http://localhost:5173 ..."
npm run dev
