# CodeStory run scripts

Scripts to run the app in each of the three flows.

**Windows:** Use the `.bat` files (e.g. `scripts\run-dev.bat`).  
**Linux / macOS:** Use the `.sh` files (e.g. `./scripts/run-dev.sh`).

| Script          | Flow   | Pipeline (Agent 1+2) | Backend   | Storage / content source        |
|-----------------|--------|----------------------|-----------|----------------------------------|
| `run-dev`       | Dev    | No (skipped)         | Local     | `documentation/`, `slides/`      |
| `run-prod`      | Prod   | Yes (on GCP)         | Cloud Run | GCS + Firestore                  |
| `run-debug`     | Debug  | Yes (local)          | Local     | `/tmp/sessions/<session_id>/`    |

---

## Dev flow — `./scripts/run-dev.sh` or `scripts\run-dev.bat` (Windows)

- **Use when:** You have existing `documentation/` and `slides/` and want to work on the dashboard/Live API only.
- **Behavior:** Starts at the dashboard; no GitHub URL step. Backend serves content from workspace `documentation/` and `slides/`. No GCP.
- **Prereqs:** Populate `documentation/` and `slides/` in the project root. Python deps and `.venv` for the backend; Node/npm for the frontend.
- **Starts:** Backend (ports 8080, 8081) and frontend (http://localhost:5173). Ctrl+C stops both. On Windows, the backend runs in a separate window—close it when done.

---

## Prod flow — `CODESTORY_PROD_URL=<url> ./scripts/run-prod.sh` or (Windows) `set CODESTORY_PROD_URL=... && scripts\run-prod.bat`

- **Use when:** Backend is deployed on Cloud Run and you want to run only the frontend locally against it.
- **Behavior:** Frontend only. All API and WebSocket traffic goes to your Cloud Run URL. Pipeline (agents 1 & 2) and storage run in GCP.
- **Prereqs:** Backend deployed to Cloud Run. Set `CODESTORY_PROD_URL` to the service URL (e.g. `https://codestory-backend-XXXXX.run.app`, no trailing slash). On Windows: `set CODESTORY_PROD_URL=https://your-service.run.app` before running the script.
- **Starts:** Frontend at http://localhost:5173 talking to `CODESTORY_PROD_URL`.

---

## Debug flow — `./scripts/run-debug.sh` or `scripts\run-debug.bat` (Windows)

- **Use when:** You want the full pipeline (clone → Agent 1 → Agent 2 → dashboard) running entirely on your machine, without GCP.
- **Behavior:** Shows GitHub URL input, runs the pipeline locally, then opens the dashboard. Backend uses SQLite and writes to `%TEMP%\sessions\<session_id>\` (Windows) or `/tmp/sessions/<session_id>/` (Unix). No GCS or Firestore.
- **Prereqs:** Python deps and `.venv` (for backend and pipeline). Node/npm for the frontend. `gcloud auth application-default login` for Gemini Live API.
- **Starts:** Backend (8080, 8081) and frontend (http://localhost:5173). Ctrl+C stops both. On Windows, the backend runs in a separate window—close it when done.
