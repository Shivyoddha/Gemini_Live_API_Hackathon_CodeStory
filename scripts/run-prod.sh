#!/usr/bin/env bash
#
# Prod flow: Full pipeline on GCP, frontend local.
# - Backend runs on Cloud Run (GCS + Firestore). Agents 1 & 2 run in GCP.
# - Frontend runs locally and talks to the deployed backend.
#
# Requires: CODESTORY_PROD_URL set to your Cloud Run service URL
#   e.g. https://codestory-backend-XXXXX.run.app (no trailing slash)
#
# Usage: ./scripts/run-prod.sh   (uses default URL for judges, or set CODESTORY_PROD_URL to override)

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Default to team's deployed Cloud Run URL (for judges / zero-config demo)
# Replace with your actual Cloud Run service URL after deploying
CODESTORY_PROD_URL="${CODESTORY_PROD_URL:-https://codestory-backend-953856802382.us-central1.run.app}"

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
