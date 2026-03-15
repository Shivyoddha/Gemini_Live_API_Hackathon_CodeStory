#!/usr/bin/env bash
#
# Debug flow: Full pipeline locally, no GCP.
# - Agent 1 (doc generator) and Agent 2 (module/slide generators) run locally.
# - Backend and frontend run locally. Content in /tmp/sessions/<session_id>/.
# - No GCS, no Firestore (SQLite + local disk).
#
# Usage: ./scripts/run-debug.sh

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Activate venv if present
if [ -d "$ROOT/.venv" ]; then
  source "$ROOT/.venv/bin/activate"
fi

echo "=== CodeStory Debug flow ==="
echo "  Backend:  local, full pipeline (Agent 1 + 2), no GCP"
echo "  Frontend: local, GitHub URL → run pipeline → dashboard"
echo ""

# Start backend in background (no GCS → local pipeline output only)
export GCS_BUCKET=
export GOOGLE_CLOUD_PROJECT=
echo "Starting backend on http://localhost:8081 (WebSocket on 8080)..."
python3 app/server.py &
BACKEND_PID=$!
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

# Wait for backend to bind
sleep 2

# Start frontend (normal flow: show GitHub input, then pipeline, then dashboard)
cd "$ROOT/app"
export VITE_DEV_SKIP_PIPELINE=false
export VITE_API_BASE=http://localhost:8081
echo "Starting frontend at http://localhost:5173 ..."
npm run dev
