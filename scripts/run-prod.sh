#!/usr/bin/env bash
#
# Prod flow: Full pipeline on GCP, frontend local.
# - Backend runs on Cloud Run (GCS + Firestore). Agents 1 & 2 run in GCP.
# - Frontend runs locally and talks to the deployed backend.
#
# Requires: CODESTORY_PROD_URL set to your Cloud Run service URL
#   e.g. https://codestory-backend-XXXXX.run.app (no trailing slash)
#
# Usage: CODESTORY_PROD_URL=https://your-service.run.app ./scripts/run-prod.sh
#   or:  ./scripts/run-prod.sh   (will prompt if CODESTORY_PROD_URL not set)

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ -z "${CODESTORY_PROD_URL}" ]; then
  echo "CODESTORY_PROD_URL is not set."
  echo "Set it to your Cloud Run backend URL, e.g.:"
  echo "  export CODESTORY_PROD_URL=https://codestory-backend-XXXXX.run.app"
  echo "Then run: ./scripts/run-prod.sh"
  exit 1
fi

# No trailing slash
CODESTORY_PROD_URL="${CODESTORY_PROD_URL%/}"

echo "=== CodeStory Prod flow ==="
echo "  Backend:  Cloud Run at $CODESTORY_PROD_URL"
echo "  Frontend: local, will use the above URL for API and WebSocket"
echo ""

cd "$ROOT/app"
export VITE_API_BASE="$CODESTORY_PROD_URL"
export VITE_DEV_SKIP_PIPELINE=false
echo "Starting frontend at http://localhost:5173 (API: $VITE_API_BASE) ..."
npm run dev
