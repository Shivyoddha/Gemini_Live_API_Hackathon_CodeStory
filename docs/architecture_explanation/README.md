# CodeStory — Detailed Architecture Explanation

This document provides a complete architectural description of the CodeStory application: repository layout, technology stack, data flow, backend and pipeline design, frontend structure, deployment, and implementation notes. No major component is omitted.

---

## 1. Overview and Purpose

**CodeStory** turns any GitHub repository into an interactive, voice-narrated code walkthrough. It:

1. **Ingests** a GitHub repo URL from the user.
2. **Generates** structured Markdown documentation and presentation slides via a three-agent ADK pipeline (Gemini).
3. **Serves** docs and slides to a React dashboard and indexes them for semantic search (ChromaDB).
4. **Proxies** browser WebSocket connections to the Vertex AI Gemini Live API so the frontend can use voice and tools (slide switching, doc search, download) without exposing credentials.

The system is split into:

- **Frontend** — React (Vite) SPA: GitHub input, pipeline progress, dashboard (slides + docs + voice UI).
- **Backend** — Python server: HTTP Content API, job tracking, pipeline launcher, WebSocket proxy to Gemini Live, optional GCS/Firestore and per-session ChromaDB.
- **Pipeline** — Python async orchestration: clone repo → blueprint agent → documentation and slide agents (parallel when “both” is selected).
- **Deployment** — Docker image with nginx + Python; single port; Cloud Run via GitHub Actions.

---

## 2. Repository Layout

```
project root (streaming_app)
├── README.md
├── readme-docs/                    # Human-oriented guides (onboarding, setup, architecture, code ref, troubleshooting, GCP)
├── docs/
│   └── architecture_explanation/   # This document
├── app/                             # Frontend + backend
│   ├── server.py                    # WebSocket proxy + HTTP Content API + pipeline launcher
│   ├── start.sh                     # Cloud Run: nginx + Python (used in container only)
│   ├── package.json, vite.config.js
│   ├── requirements.txt             # Backend deps: websockets, google-auth, chromadb, GCS, Firestore
│   ├── src/
│   │   ├── main.jsx → App.jsx
│   │   ├── App.jsx                  # Page state: input | running | dashboard
│   │   ├── config.js                # API_BASE, getSessionId()
│   │   ├── components/
│   │   │   ├── GitHubInputPage.jsx
│   │   │   ├── PipelineProgress.jsx
│   │   │   ├── LiveAPIDemo.jsx      # Dashboard: slides, docs, voice, tools
│   │   │   ├── SlideCanvas.jsx
│   │   │   └── *.css
│   │   └── utils/
│   │       ├── gemini-api.js        # GeminiLiveAPI, MultimodalLiveResponseMessage, tool definitions
│   │       ├── media-utils.js       # Audio capture/playback, screen capture
│   │       └── tools.js             # SwitchSlide, SearchDocs, DownloadContent, etc.
│   └── public/
├── pipeline/                        # ADK pipeline
│   ├── main.py                      # CLI entry; clone → context → blueprint → docs/slides
│   ├── pipeline_context.py         # PipelineContext dataclass (shared state)
│   ├── repo_utils.py               # clone_repository, read_repository_contents
│   ├── common.py                   # ensure_api_key, make_session_service, run_agent_query_with_retry, log
│   ├── blueprint_agent.py          # Agent 1: blueprint from repo
│   ├── codebase_doc_agent.py       # Agent 2: Markdown docs from blueprint
│   ├── slide_workflow.py           # Agent 3: slides + speaker scripts + slide_index.json
│   └── requirements.txt            # google-adk, google-genai, python-dotenv
├── documentation/                  # Generated or hand-written Markdown docs (flat *.md)
├── slides/                          # Generated or hand-written slides (per-module dirs: <module>/*.md)
├── scripts/
│   ├── README.md
│   ├── run-dev.sh                  # Dev: skip pipeline, use local docs/slides
│   ├── run-prod.sh                 # Prod frontend only (CODESTORY_PROD_URL)
│   └── run-debug.sh                # Full local: backend + frontend + pipeline
├── Dockerfile                      # Python 3.11 + nginx; app + pipeline; PORT 8080
└── .github/workflows/
    └── deploy-cloudrun.yml         # Deploy to Cloud Run on push to main / workflow_dispatch
```

**Workspace assumptions:** `server.py` is run from `app/`; workspace root is the parent of `app/`. So `documentation/` and `slides/` are resolved as `../documentation` and `../slides` when not using session-scoped or GCS paths.

---

## 3. Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, react-markdown, remark-gfm, mermaid, react-icons |
| Backend HTTP | Python 3, stdlib `http.server.HTTPServer` |
| Backend WebSocket | Python 3, `asyncio`, `websockets` |
| Auth (Gemini) | `google.auth` default credentials (ADC); token never sent to browser |
| Pipeline | Python 3, Google ADK (`google.adk.agents.Agent`), Gemini (e.g. gemini-2.5-flash, gemini-2.5-flash-lite) |
| Job/store (prod) | Firestore (sessions/jobs), GCS (per-session docs/slides) |
| Job/store (dev) | SQLite `app/jobs.db`, local disk (`/tmp/sessions/<session_id>/`) |
| Vector search | ChromaDB (per-session, in-memory EphemeralClient) |
| Container | Docker (Python 3.11-slim + nginx) |
| Deploy | Google Cloud Run; GitHub Actions (GCP_SA_KEY, GCP_PROJECT_ID, GCS_BUCKET) |

---

## 4. High-Level Data Flow

1. **User** opens the app; sees GitHub URL input (or in dev with `VITE_DEV_SKIP_PIPELINE=true` goes straight to dashboard).
2. **Frontend** sends `POST /run-pipeline` with `{ url, session_id }`. **Backend** creates a job ID, starts pipeline in a background thread, returns `{ jobId }`.
3. **Pipeline** runs in a subprocess: `python pipeline/main.py --url <url> --choice 3 --output-dir <session_out>`. It clones the repo, builds `PipelineContext`, runs Agent 1 (blueprint), then Agents 2 and 3 in parallel (docs + slides). Output: `documentation/`, `slides/`, ZIPs, `slide_index.json` under the session output dir.
4. **Backend** (in the same process as the pipeline thread) parses pipeline stdout and updates job status in Firestore or SQLite (e.g. "cloning", "running", "indexing"). When the subprocess exits 0, it may upload to GCS and then calls `index_content_into_chroma(session_id)` and sets status to `"done"`.
5. **Frontend** polls `GET /pipeline-status/<jobId>?session_id=...` until status is `done`, then navigates to the dashboard.
6. **Dashboard** loads `GET /content?session_id=...`. Backend returns `{ docs, slides, project_name }` from GCS (if configured and session_id present) or from local/session disk.
7. **User** clicks Connect; frontend opens WebSocket to backend (e.g. `ws://localhost:8080` or `wss://.../ws` in production). First message: `{ bearer_token?, service_url }`. If `bearer_token` is omitted, backend uses ADC to get a token, then connects to the Vertex BidiGenerateContent WebSocket and proxies frames both ways.
8. **Voice/tools:** Browser sends audio (PCM); Gemini can respond with audio and/or text and tool calls (e.g. `switch_slide`, `search_documentation`, `download_content`). The UI executes tools (e.g. HTTP GET to `/search-docs`, state updates for slide index) and can send tool results back to the model.

---

## 5. Backend (app/server.py)

Single process, two main parts: an **HTTP server** in a daemon thread and an **async WebSocket server** on the main asyncio loop.

### 5.1 Ports and Deployment

- **Local:** `WS_PORT` (default 8080) for WebSocket, `HTTP_PORT` (default 8081) for HTTP.
- **Docker/Cloud Run:** `start.sh` sets `HTTP_PORT=8081`, `WS_PORT=8082`. Nginx listens on `PORT` (8080), proxies `/health` → 200, `/ws` → Python WebSocket, `/` → Python HTTP. So one public port serves both.

### 5.2 HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/content` | Query: `session_id`. Returns `{ docs, slides, project_name }`. Docs/slides from GCS (if `GCS_BUCKET` and session_id) or from local/session dir. |
| POST | `/run-pipeline` | Body: `{ url, session_id? }`. Creates job, starts pipeline subprocess in background, returns `{ jobId }`. |
| GET | `/pipeline-status/<id>` | Query: `session_id`. Returns `{ status, message }` from Firestore or SQLite. |
| GET | `/search-docs` | Query: `q`, `session_id`. Returns `{ chunks }` from session ChromaDB (top matches). |

All JSON responses; CORS allows `*` for development.

### 5.3 Content Loading (load_content)

- **GCS path:** If `GCS_BUCKET` and `session_id` and GCS client available: list/read blobs under `{session_id}/documentation/` and `{session_id}/slides/`. Uses `documentation_manifest.json` for doc section IDs when present. Builds list of `{ filename, module, text }` for docs and `{ module, filename, text }` for slides.
- **Local/session path:** If session dir exists (`/tmp/sessions/<session_id>/`), read from `documentation/` and `slides/<module>/` there; otherwise use workspace `DOCS_DIR` and `SLIDES_DIR`. Same structure: docs get a `module` key (filename stem lowercased, `_and_` → `__`); optional `documentation_manifest.json` for section mapping.
- **project_name:** Inferred from content (e.g. quoted name near “project”/“application”) or `"this project"`.

### 5.4 Job Storage

- **With Firestore and session_id:** Job state in `sessions/<session_id>/jobs/<job_id>` (url, status, message, created_at).
- **Without:** SQLite `app/jobs.db`, table `jobs (id, url, status, message, created_at)`.

### 5.5 Pipeline Runner (_run_pipeline_background)

- Creates session output dir: `/tmp/sessions/<session_id>/`.
- Starts subprocess: `python pipeline/main.py --url <url> --choice 3 --output-dir <session_out>`, cwd `pipeline/`, env with `PYTHONUNBUFFERED=1`. Prefers `.venv` Python if present.
- Streams stdout; parses lines to update job status (e.g. "cloning", "running").
- On exit 0: optionally uploads session dir to GCS (`_upload_session_to_gcs`), then starts a daemon thread that calls `index_content_into_chroma(session_id)` and sets job to `"done"`.
- **Note:** The code calls `index_content_into_chroma(session_id)` but only `_index_content_into_session_chroma(session_id, content)` is defined. A wrapper that loads content (e.g. via `load_content(session_id)`) and then calls `_index_content_into_session_chroma(session_id, content)` is required for indexing to work; otherwise indexing may be a no-op or error.

### 5.6 ChromaDB

- Per-session in-memory collection: `_session_chroma[session_id]` = ChromaDB `EphemeralClient` collection `"documentation"`.
- **Indexing:** `_index_content_into_session_chroma(session_id, content)` chunks doc text (word-based, default 500 words), adds slides as single chunks; upserts with ids like `doc__<filename>__<i>` and `slide__<module>__<filename>`, metadata `source`, `type`, and for slides `module`.
- **Search:** `search_docs(query, session_id, n_results=3)` queries the session collection and returns `[{ text, source }]`.

### 5.7 WebSocket Proxy

- Listens on `WS_PORT`. For each client:
  - Receives first message: `{ bearer_token?, service_url }`.
  - If no `bearer_token`, uses `google.auth.default()` and refreshes if needed.
  - Connects to `service_url` (Vertex BidiGenerateContent) with `Authorization: Bearer <token>` and SSL (certifi).
  - Two asyncio tasks: one forwards client → server, one server → client (JSON-serialized messages). When one side closes, the other is cancelled and connections closed.

---

## 6. Pipeline (pipeline/)

### 6.1 Entry and Environment

- **Entry:** `pipeline/main.py` invoked as subprocess by the backend or interactively. Loads `.env` from project root; requires `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- **CLI:** `--url`, `--choice` (1=docs, 2=slides, 3=both), `--output-dir` (default project root). Output dir gets `documentation/` and `slides/`.

### 6.2 PipelineContext (pipeline_context.py)

Single shared dataclass used by all agents:

- **Inputs:** `repo_url`, `repo_path`, `repo_contents` (full text read once), `repo_stats`, `user_id`.
- **Outputs:** `blueprint`, `raw_blueprint_text`, `doc_output`, `doc_zip_path`, `slide_output`, `slide_zip_path`, `slide_index_path`.

Repository is read from disk once; agents receive `ctx.repo_contents` and never re-read the repo.

### 6.3 Repo Utils (repo_utils.py)

- **clone_repository(url):** `git clone` into a unique temp dir; returns path.
- **read_repository_contents(repo_path):** Walks repo, skips `.git`, `node_modules`, `__pycache__`, etc., and binary/low-value extensions (images, fonts, `.lock`, etc.). Enforces max file size and `max_total_chars` (e.g. 400k); returns concatenated text and `RepoReadStats(files, chars, truncated)`.

### 6.4 Common (common.py)

- **ensure_api_key():** Reads `GEMINI_API_KEY` or `GOOGLE_API_KEY`; sets both in `os.environ`.
- **make_session_service():** Returns a new `InMemorySessionService()` per agent to avoid cross-agent session mixing.
- **run_agent_query_with_retry():** Runs an ADK agent query with exponential backoff on transient errors.
- **log(level, msg):** Simple structured print (INFO/WARN/ERROR/DEBUG).

### 6.5 Agent 1 — Blueprint (blueprint_agent.py)

- **Model:** `gemini-2.5-flash`.
- **Role:** Repository Structure Analyst; produces a `SLIDE_BLUEPRINT` Python list from repo evidence only (anti-hallucination rules). Mandatory sections: Project Overview, Business Value, System Architecture; then dynamic sections from evidence.
- **Output:** Structured list (parsed with retry on failure) and raw text; stored in `ctx.blueprint` and `ctx.raw_blueprint_text`.

### 6.6 Agent 2 — Documentation (codebase_doc_agent.py)

- **Model:** `gemini-2.5-flash`.
- **Role:** Codebase Documentation Architect; follows the blueprint to produce one big Markdown document with level-2 section headers. Sections are split into separate `.md` files, written under `docs_out_dir`; a manifest and ZIP are produced. Paths stored in `ctx.doc_output`, `ctx.doc_zip_path`.

### 6.7 Agent 3 — Slides (slide_workflow.py)

- **Model:** `gemini-2.5-flash-lite`.
- **Role:** Technical Presentation Architect; same anti-hallucination rules; produces slides and speaker scripts per section from the blueprint.
- **Output:** Markdown with `## Section` and `### Slide N: Title` blocks; extracted and filtered (min bullets/words, no redundant title-only slides). Written as `slides/<module>/<nnn>_<title>.md` and `speaker_script.md` per section; then zipped. **slide_index.json** is built: list of sections, each with `slides[]` (slide_number, title, file path) and `speaker_script_file`, `script_word_count`. This index is the contract for the Live API narrator (slide order, paths, pacing). Stored in `ctx.slide_output`, `ctx.slide_zip_path`, `ctx.slide_index_path`.

### 6.8 Orchestration (main.py)

1. Load env, ensure API key.
2. Clone repo; read contents once; build `PipelineContext`.
3. Run blueprint agent; set `ctx.blueprint` and `ctx.raw_blueprint_text`.
4. If choice 1: docs only. If 2: slides only. If 3: `asyncio.gather(docs, slides)` in parallel.
5. Print summary and paths (including `slide_index.json`).

---

## 7. Frontend (app/src)

### 7.1 Routing and Pages (App.jsx)

- **State:** `page` ∈ `{ 'input' | 'running' | 'dashboard' }`, `jobId`, `repoUrl`.
- **Dev:** If `VITE_DEV_SKIP_PIPELINE === 'true'`, initial page is `dashboard` (no GitHub step).
- **input:** Renders `GitHubInputPage`; on submit calls `POST /run-pipeline`, then `onJobStarted(id, url)` → switch to `running`.
- **running:** Renders `PipelineProgress` with `jobId`, `repoUrl`; polls `GET /pipeline-status/<jobId>`; on status `done` calls `onPipelineComplete()` → switch to `dashboard`.
- **dashboard:** Renders `LiveAPIDemo` full-screen.

### 7.2 Config (config.js)

- **API_BASE:** `VITE_API_BASE` or `http://localhost:8081` (no trailing slash).
- **getSessionId():** Reads/writes `localStorage.codestory_session_id`; generates UUID if missing. Used for all API calls that need session isolation.

### 7.3 GitHubInputPage

- Form: GitHub URL input; submit → `fetch(POST /run-pipeline, { url, session_id })`; on 200 passes `response.jobId` and URL to `onJobStarted`.

### 7.4 PipelineProgress

- Polls `GET /pipeline-status/<jobId>?session_id=...` on an interval; displays status/message; when `status === 'done'` calls `onComplete()`.

### 7.5 LiveAPIDemo (Dashboard)

- **Content:** Fetches `GET /content?session_id=...`; builds system instruction for Gemini from docs + slides (and optionally search results).
- **UI:** Sidebar (modules, “Doc” button, play); main area: slide canvas or doc viewer (Markdown + Mermaid); control bar (mic, volume, screen share); transcript/chat panel.
- **WebSocket:** Proxy URL (e.g. `ws://localhost:8080`) and Vertex `service_url` (and optional bearer_token). Connects via `GeminiLiveAPI`; sends first message with `service_url` and optional `bearer_token`. Handles audio in/out and tool calls.
- **Tools (utils/tools.js):**
  - **SwitchSlideTool:** `switch_slide(module, slide_number)` — updates current module/slide in UI.
  - **SearchDocsTool:** `search_documentation(query)` — `GET /search-docs?q=...&session_id=...`; returns chunks to callback; can be sent back to model.
  - **DownloadContentTool:** `download_content(type)` — transcript (.md) or video (.webm) via callback.
  - Optional: ShowAlertTool, AddCSSStyleTool, ShowDynamicSlideTool for demos.

### 7.6 SlideCanvas and Doc View

- **SlideCanvas:** Renders one slide’s Markdown (react-markdown, remark-gfm).
- **Doc view:** Renders full doc Markdown; Mermaid code blocks rendered via `mermaid.render()` in `MermaidBlock`.

### 7.7 Gemini API and Media (utils/)

- **gemini-api.js:** `GeminiLiveAPI` (connect, send/receive, tool handling), `MultimodalLiveResponseMessage` (parses server payloads: SETUP_COMPLETE, TURN_COMPLETE, INTERRUPTED, INPUT/OUTPUT_TRANSCRIPTION, TOOL_CALL, TEXT, AUDIO), `FunctionCallDefinition` base for tools.
- **media-utils.js:** Audio capture (e.g. mic → PCM), playback, optional screen capture for recording.

### 7.8 Content and Module Matching

- Docs are flat: `documentation/01_Project_Overview.md`. Server assigns `module` from filename stem (lowercase, `_and_` → `__`) to align with slide folders e.g. `slides/01_project_overview/`.
- Slides live under `slides/<module>/*.md`. Frontend filters docs by module for the “Doc” button; system instruction can include full docs for the narrator.

---

## 8. Deployment and Operations

### 8.1 Docker (Dockerfile)

- Base: `python:3.11-slim`; nginx installed.
- Pip installs from `app/requirements.txt` and `pipeline/requirements.txt`.
- Copies `app/server.py`, `app/start.sh`, entire `pipeline/`; creates `/app/documentation` and `/app/slides`.
- Env: `PORT=8080`, `HTTP_PORT=8081`, `WS_PORT=8082`, `GCS_BUCKET=""`.
- `WORKDIR /app/app`; `CMD ["./start.sh"]`.

### 8.2 start.sh (Container Only)

- Writes nginx config: listen on `PORT`; `/health` → 200; `/ws` → proxy to `WS_PORT`; `/` → proxy to `HTTP_PORT`.
- Starts `python server.py` in background; sleeps 3; exec nginx (foreground).

### 8.3 Cloud Run (GitHub Actions)

- **Workflow:** `.github/workflows/deploy-cloudrun.yml` on push to `main` and `workflow_dispatch`.
- **Secrets:** `GCP_SA_KEY`, `GCP_PROJECT_ID`, `GCS_BUCKET`.
- **Steps:** Checkout; auth with `credentials_json`; setup gcloud; `gcloud run deploy ... --source .` with env `GOOGLE_CLOUD_PROJECT`, `GCS_BUCKET`, `--allow-unauthenticated`, `--no-cpu-throttling`.

### 8.4 Scripts (scripts/)

- **run-dev.sh:** Sets `VITE_DEV_SKIP_PIPELINE=true`, `VITE_API_BASE=http://localhost:8081`; starts backend then `npm run dev` in app. Uses existing `documentation/` and `slides/`; no pipeline run.
- **run-prod.sh:** Frontend-only; expects `CODESTORY_PROD_URL` for API/WS.
- **run-debug.sh:** Backend + frontend; pipeline runs locally; content under `/tmp/sessions/<session_id>/`; SQLite jobs; no GCS/Firestore.

---

## 9. Security and Configuration Notes

- **Credentials:** Google tokens are obtained and used only on the backend (WebSocket proxy, optional pipeline). The browser never receives API keys or bearer tokens.
- **CORS:** HTTP server sends permissive CORS (`*`); production should restrict origins.
- **Pipeline:** Runs as subprocess with server env; only trusted repo URLs should be accepted.
- **Environment:** Backend/pipeline need `GEMINI_API_KEY` or `GOOGLE_API_KEY`; for prod storage and ADC: `GCS_BUCKET`, `GOOGLE_CLOUD_PROJECT`; frontend uses `VITE_API_BASE` (and optionally `VITE_DEV_SKIP_PIPELINE`) at build time.

---

## 10. Summary Table

| Component | Location | Responsibility |
|-----------|----------|----------------|
| HTTP API | app/server.py | /content, /run-pipeline, /pipeline-status, /search-docs |
| WebSocket proxy | app/server.py | Auth, proxy to Vertex BidiGenerateContent |
| Job store | Firestore or SQLite | Per-job status/message |
| Content store | GCS or local/session dir | Docs and slides per session |
| Vector search | ChromaDB (in-memory per session) | search_docs |
| Pipeline entry | pipeline/main.py | Clone, context, blueprint, docs + slides |
| Agent 1 | blueprint_agent.py | Blueprint from repo |
| Agent 2 | codebase_doc_agent.py | Markdown docs + ZIP |
| Agent 3 | slide_workflow.py | Slides + scripts + slide_index.json |
| Frontend shell | App.jsx | input → running → dashboard |
| Dashboard | LiveAPIDemo.jsx | Content, slides, docs, voice, tools |
| Container | Dockerfile + start.sh | nginx + Python on one port |
| CI/CD | deploy-cloudrun.yml | Deploy to Cloud Run on main / manual |

This architecture explanation is intended to be complete and accurate as of the current codebase; for line-level details, refer to the source files listed above.
