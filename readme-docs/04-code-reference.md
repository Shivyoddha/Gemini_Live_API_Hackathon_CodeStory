# CodeStory — Code reference

Where to find main logic and how the main APIs and tools work.

---

## Frontend (app/src)

### App.jsx

- **Routing:** `page` state: `input` | `running` | `dashboard`. Dev mode can start at `dashboard`.
- **Handlers:** `handleJobStarted(id, url)` → go to running; `handlePipelineComplete()` → go to dashboard.

### GitHubInputPage.jsx

- **POST** `http://localhost:8081/run-pipeline` with `{ url }`. On success, `onJobStarted(data.jobId, url)`.

### PipelineProgress.jsx

- Polls **GET** `/pipeline-status/<jobId>` until status is `done`, then `onComplete()`.

### LiveAPIDemo.jsx

- **Content:** Fetches **GET** `/content`, builds system instruction from `docs` and `slides`, `project_name`.
- **WebSocket:** `GeminiLiveAPI(proxyUrl, projectId, model)` from `utils/gemini-api.js`. Sends setup with system instruction, voice, tools.
- **Tools:** `SwitchSlideTool` (set activeModule, activeSlideIndex), `SearchDocsTool` (GET `/search-docs?q=...`), `DownloadContentTool` (transcript or video download).
- **Transcript:** `addMessage(text, type)` with types `user`, `assistant`, `user-transcript`, `system`. User/transcript right-aligned, assistant left, system centered.

### SlideCanvas.jsx

- Props: `content`, `moduleName`, `slideFilename`, `slideNumber`, `totalSlides`. Renders slide Markdown.

### utils/gemini-api.js

- **MultimodalLiveResponseMessage** — Parses server JSON into `type` (TEXT, AUDIO, SETUP_COMPLETE, TURN_COMPLETE, INTERRUPTED, TOOL_CALL, INPUT_TRANSCRIPTION, OUTPUT_TRANSCRIPTION) and `data`.
- **FunctionCallDefinition** — Base for tools: `getDefinition()` for API, `runFunction(params)` calls `functionToCall(params)`.
- **GeminiLiveAPI** — `connect()`, `disconnect()`, `sendTextMessage()`, `sendAudioMessage()`, handles tool calls and invokes tool instances.

### utils/tools.js

- **SwitchSlideTool(onSwitch)** — Params: `module`, `slide_number`. Calls `onSwitch(moduleName, slideNumber)`.
- **SearchDocsTool(onResult)** — GET `/search-docs?q=...`, then `onResult(query, chunks, error?)`. On fetch failure, passes `(query, [], errorMessage)` so the UI can surface the error.
- **DownloadContentTool(onDownload)** — Params: `type` = `transcript` | `video`. Calls `onDownload(type)`.

### Error handling

- **Job status:** `GET /pipeline-status/<id>` returns `{ status, message }`. On error, `message` contains the last pipeline output (up to 2000 chars) for debugging.
- **HTTP errors:** Endpoints return `{ "error": "..." }` with 4xx/5xx status for validation or server failures.
- **WebSocket:** Before closing on auth/timeout/upstream failure, the proxy sends `{"type":"ERROR","message":"...","code":"..."}` so the client can display the reason. See [Error logging](07-error-logging.md).

### utils/media-utils.js

- **AudioStreamer** — Mic capture, 16 kHz mono PCM, chunks to callback.
- **AudioPlayer** — Queue base64 PCM, decode and play; `interrupt()` clears queue.

---

## Backend (app/server.py)

- **Paths:** WORKSPACE_ROOT = parent of app; DOCS_DIR = documentation, SLIDES_DIR = slides.
- **load_content()** — Globs docs and slides, assigns each doc a `module` (lowercase, _and_ → __). Returns `{ docs, slides, project_name }`.
- **GET /content** — Returns load_content() JSON.
- **POST /run-pipeline** — Body `{ url }`. Subprocess: `main.py --url <url> --choice 3`. Returns `{ jobId }`.
- **GET /pipeline-status/<id>** — SQLite job status.
- **GET /search-docs?q=** — ChromaDB query; returns `{ chunks }`.
- **WebSocket (8080)** — Proxy to Gemini Live API with ADC.

---

## Pipeline (pipeline)

- **main.py** — `--url`, `--choice` (1=docs, 2=slides, 3=both). Builds PipelineContext, runs blueprint agent, then doc and/or slide agents. Writes to ../documentation and ../slides.
- **blueprint_agent.py** — Blueprint from codebase.
- **codebase_doc_agent.py** — Markdown docs.
- **slide_workflow.py** — Slide Markdown per module.

---

## Config

- Content API: `http://localhost:8081/content`.
- WebSocket: `ws://localhost:8080`.
- Ports in server.py: WS_PORT=8080, HTTP_PORT=8081.

---

Next: [Troubleshooting](05-troubleshooting.md).
