# CodeStory — Troubleshooting

Common issues and how to fix them.

---

## Server won’t start

- **Port in use:** Ensure 8080 and 8081 are free. On Linux: `lsof -i :8080 -i :8081` (or `ss -tlnp`). Kill the process or change `WS_PORT` / `HTTP_PORT` in `react-demo-app/server.py`.
- **Missing dependencies:** Run `pip install -r react-demo-app/requirements.txt` (and `combined_workflow_sent/requirements.txt` if you run the pipeline). If you use ChromaDB search, `pip install chromadb`.
- **Python path:** Run `python server.py` from inside `react-demo-app` so that `WORKSPACE_ROOT` is the parent of `react-demo-app`.

---

## “Connect” fails or no “Ready!”

- **Auth:** Run `gcloud auth application-default login` and ensure the project has Vertex AI / Gemini Live API enabled.
- **Proxy URL:** In the UI, Configuration should show WebSocket URL `ws://localhost:8080` (or the host/port where server.py is running). If you use another machine, use that host instead of localhost.
- **CORS / network:** The frontend must be able to reach the proxy. If the frontend is on another host, the server must listen on 0.0.0.0 (it does by default); ensure no firewall blocks 8080.
- **Browser console:** Check for WebSocket errors or 4xx/5xx on the initial request. The proxy logs may show auth or upstream errors.

---

## Content is empty (no docs or slides)

- **Paths:** The server reads from `WORKSPACE_ROOT/documentation` and `WORKSPACE_ROOT/slides`, where workspace root is the parent of `react-demo-app`. If you run the server from elsewhere, those folders might be wrong. Run from `react-demo-app` and ensure `../documentation` and `../slides` exist and contain `.md` files.
- **Pipeline not run:** If you didn’t run the pipeline (or dev mode with existing content), `documentation/` and `slides/` may be empty. Run the pipeline with a GitHub URL or add Markdown files manually for dev.
- **API check:** Open `http://localhost:8081/content`. You should see JSON with `docs` and `slides` arrays. If they’re empty, the server isn’t finding the files.

---

## Documentation empty for a module

- **Module key:** Docs get a `module` field from the filename (e.g. `01_Project_Overview.md` → `01_project_overview`). Slide folders use the same convention; names with “and” use double underscore (e.g. `04_data_model__relationships`). The server normalises `_and_` → `__` in doc filenames so they match. If you added docs by hand, name them like the slide folders (lowercase, `__` for “and”).
- **Restart server:** After adding or renaming docs, restart `server.py` so `load_content()` runs again. If you use ChromaDB, it will re-index on startup when content exists.

---

## Pipeline fails (clone or agents)

- **Git:** `git` must be on PATH. The pipeline clones into a temp directory under the workspace.
- **API key:** Pipeline needs `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env` (project root or `combined_workflow_sent`). If missing, the pipeline will error early.
- **Network:** Clone requires access to GitHub (and possibly VPN/proxy for your network). Agent calls need internet access to the Gemini API.
- **Logs:** Pipeline output is captured by the server and stored with the job; check the running terminal or job status message. Running `python main.py` inside `combined_workflow_sent` gives full tracebacks.

---

## Microphone or audio not working

- **Permissions:** Browser must have microphone access; check the site settings and allow for localhost (or your dev URL).
- **HTTPS:** Some browsers restrict mic to secure contexts. Use `http://localhost` for dev; for other hosts you may need HTTPS.
- **Device:** In the UI, Configuration lists the selected mic. Try another device or default. Ensure no other app is exclusively using the mic.

---

## Search (ChromaDB) returns nothing

- **Installed:** Run `pip install chromadb`. Restart the server.
- **Indexed:** On startup, if `documentation/` and `slides/` exist, the server will index them. If you add content later, restart the server to re-index (or call the indexing endpoint if you add one). The `search_documentation` tool calls `GET /search-docs?q=...`; if ChromaDB isn’t set up, the endpoint returns empty.

---

## Build / deploy

- **Frontend build:** `cd react-demo-app && npm run build`. Static output is in `dist/`. Point your HTTP server at `dist` and ensure API and WebSocket URLs in the app point to your backend (e.g. set via env or config).
- **Backend:** Run `server.py` in a process manager (e.g. systemd, Docker). Expose 8080 (WebSocket) and 8081 (HTTP). Use a reverse proxy (e.g. nginx) for HTTPS and optional path-based routing.

---

For more detail on components and APIs, see [Code reference](04-code-reference.md) and [Architecture](03-architecture.md).
