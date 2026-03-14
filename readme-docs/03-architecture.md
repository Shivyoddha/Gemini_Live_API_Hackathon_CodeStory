# CodeStory — Architecture

This document describes the repository layout, data flow, and how the main components interact.

---

## Repository layout

```
project root
├── README.md                    # Main readme (GitHub landing)
├── readme-docs/                 # Detailed documentation
│   ├── 01-onboarding.md
│   ├── 02-setup.md
│   ├── 03-architecture.md       # This file
│   ├── 04-code-reference.md
│   └── 05-troubleshooting.md
├── react-demo-app/              # Frontend + backend server
│   ├── server.py                # WebSocket proxy + HTTP Content API
│   ├── package.json / src/     # React app (Vite)
│   ├── public/
│   └── requirements.txt
├── combined_workflow_sent/      # Pipeline: clone → docs + slides
│   ├── main.py                  # Entrypoint
│   ├── blueprint_agent.py       # Agent 1: blueprint
│   ├── codebase_doc_agent.py    # Agent 2: documentation
│   ├── slide_workflow.py        # Agent 3: slides
│   ├── pipeline_context.py
│   ├── repo_utils.py
│   └── requirements.txt
├── documentation/               # Generated or hand-written Markdown docs
│   └── *.md                     # One per topic (e.g. 01_Project_Overview.md)
├── slides/                      # Generated or hand-written slides
│   └── <module_name>/           # One dir per module
│       └── *.md                 # One file per slide
└── logo.png
```

The server (`react-demo-app/server.py`) assumes it is run from inside `react-demo-app` and that the **workspace root** is the parent directory. So `documentation/` and `slides/` are resolved as `../documentation` and `../slides` relative to the server script.

---

## High-level data flow

1. **User enters GitHub URL** (or uses dev mode).
2. **Frontend** calls `POST http://localhost:8081/run-pipeline` with `{ "url": "https://github.com/..." }`.
3. **Server** starts a background job, returns `jobId`, and runs `combined_workflow_sent/main.py` with `--url` and `--choice 3` (both docs and slides).
4. **Pipeline** clones the repo, runs Gemini agents to generate Markdown under `documentation/` and `slides/<module>/`.
5. **Frontend** polls `GET http://localhost:8081/pipeline-status/<jobId>` until status is `done`, then navigates to the dashboard.
6. **Dashboard** loads content via `GET http://localhost:8081/content`. Response includes:
   - `docs`: list of `{ filename, module, text }` (each doc has a normalised `module` key matching slide module names).
   - `slides`: list of `{ module, filename, text }`.
   - `project_name`: inferred from content.
7. **User clicks Connect** — Frontend opens a WebSocket to `ws://localhost:8080`. The **proxy** (server.py) accepts the connection, uses Application Default Credentials to obtain a token, and connects to the Gemini Live API, relaying messages both ways.
8. **Voice** — Browser sends audio (PCM) over the WebSocket; Gemini responds with audio and/or text. The UI shows transcript and plays audio. Tool calls (e.g. `switch_slide`, `search_documentation`) are executed in the browser and results can be sent back to the model.

---

## Backend server (react-demo-app/server.py)

Single process, two parts:

### HTTP server (port 8081)

- **GET /content** — Reads `documentation/*.md` and `slides/<module>/*.md` from disk, builds a JSON with `docs`, `slides`, and `project_name`. Docs get a `module` field derived from the filename (e.g. `01_Project_Overview.md` → `01_project_overview`; `_and_` → `__` to match slide folder names).
- **POST /run-pipeline** — Body: `{ "url": "https://github.com/..." }`. Creates a job ID, starts `combined_workflow_sent/main.py` in a subprocess, returns `{ "jobId": "..." }`.
- **GET /pipeline-status/<id>** — Returns job status from SQLite (`jobs.db` in react-demo-app).
- **GET /search-docs?q=...** — If ChromaDB is installed, queries the vector index and returns top chunks; otherwise returns empty. Used by the `search_documentation` tool.

On startup, if `documentation/` and `slides/` exist and ChromaDB is available, the server can auto-index content into ChromaDB.

### WebSocket proxy (port 8080)

- Listens for browser connections.
- For each connection, uses `google.auth.default()` to get credentials and a token, then opens a connection to the Gemini Live API endpoint.
- Forwards messages between browser and Gemini (binary and JSON). All auth is on the server; the browser never sees tokens.

---

## Pipeline (combined_workflow_sent)

- **Input:** GitHub repo URL (and choice: docs only, slides only, or both).
- **Steps:**
  1. Clone repo (or use existing clone).
  2. Build a pipeline context (repository contents on disk).
  3. **Blueprint agent** — Produces a high-level blueprint of the codebase.
  4. **Documentation agent** — Writes Markdown files into `../documentation/`.
  5. **Slide workflow** — Generates slide Markdown files into `../slides/<module>/`.
- **Output:** Populated `documentation/` and `slides/` directories. The server’s `load_content()` then serves these via `/content`.

---

## Frontend (react-demo-app/src)

- **App.jsx** — Top-level routing: `input` (GitHub URL) → `running` (pipeline progress) → `dashboard` (LiveAPIDemo). Dev mode can start at `dashboard`.
- **GitHubInputPage.jsx** — Form to submit repo URL; calls `POST /run-pipeline` and hands off to PipelineProgress.
- **PipelineProgress.jsx** — Polls `GET /pipeline-status/<jobId>`, shows progress, then switches to dashboard on completion.
- **LiveAPIDemo.jsx** — Main dashboard:
  - Fetches content from `GET /content`, builds system instruction for Gemini from docs + slides.
  - Renders sidebar (modules, doc button, play button), slide canvas (or doc view), and Transcript & Chat panel.
  - Manages WebSocket connection (via `GeminiLiveAPI`), audio capture/playback, and tool calls (switch_slide, search_docs, download_content).
- **SlideCanvas.jsx** — Renders a single slide’s Markdown.
- **utils/gemini-api.js** — `GeminiLiveAPI` class, message parsing (`MultimodalLiveResponseMessage`), and tool-definition helpers.
- **utils/media-utils.js** — Audio capture (e.g. microphone to PCM) and playback.
- **utils/tools.js** — Tool definitions: `SwitchSlideTool`, `SearchDocsTool`, `DownloadContentTool`, plus optional demo tools (alert, CSS).

---

## Content and module matching

- **Docs** are flat files: `documentation/01_Project_Overview.md`. The server assigns each doc a `module` key (e.g. `01_project_overview`) by lowercasing the stem and replacing `_and_` with `__` so it matches the slide folder name (e.g. `slides/01_project_overview/`).
- **Slides** are under `slides/<module>/<filename>.md`. The frontend filters docs per module so the “Doc” button for a module shows only that module’s doc(s). The agent’s system instruction is built from the full doc set (and optionally from search results) so it can answer across the codebase while the UI can show a single module’s doc.

---

## Security notes

- **Credentials** — Google credentials are used only on the server (WebSocket proxy and optional pipeline). The browser never receives API keys or tokens.
- **CORS** — The HTTP server sends permissive CORS headers so the frontend (e.g. localhost:5173) can call port 8081. In production you would restrict origins.
- **Pipeline** — Runs in a subprocess with the same env as the server; ensure only trusted repo URLs are used.

---

Next: [Code reference](04-code-reference.md) — Where to find key logic and how the tools work.
