# CodeStory — Live Codebase Walkthrough with Gemini

A **real-time, voice-narrated codebase walkthrough** powered by Google’s **Gemini Live API**. Paste a GitHub repo URL → the pipeline generates documentation and slides → Gemini explains each slide with natural speech. You can interrupt anytime, ask questions, and move through slides with your voice or the UI.

Built for the **Gemini Live API Hackathon** (Creative Story track).

---

## What It Does

| Feature | Description |
|--------|-------------|
| **Live voice narration** | Gemini 2.5 Flash Live API speaks slide content in real time (no separate STT → LLM → TTS). |
| **Slide-based walkthrough** | Documentation and slides are generated from the repo; the AI explains slide-by-slide. |
| **Interrupt anytime** | Barge-in: ask a question mid-explanation; the agent answers then continues. |
| **RAG over docs** | For large codebases, the agent can call `search_documentation` to pull details from ChromaDB. |
| **Transcript & video** | At the end of a module you can download the Q&A transcript or the screen recording. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                                   │
│  • GitHub URL input → pipeline trigger                                    │
│  • Dashboard: slides sidebar, slide canvas, chat panel, mic/volume       │
│  • WebSocket client → ws://localhost:8080                                  │
│  • Content API (docs/slides, RAG) → http://localhost:8081                 │
└─────────────────────────────────────────────────────────────────────────┘
         │                                    │
         │ WebSocket (audio + client content)  │ HTTP (content, search, jobs)
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Python server (server.py)                                               │
│  • WebSocket proxy to Gemini Live API (Google auth)                      │
│  • HTTP server: /content, /search-docs, /run-pipeline, /pipeline-status  │
│  • SQLite: job tracking for pipeline runs                                │
│  • ChromaDB: vector search over documentation                            │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ subprocess
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  combined_workflow_sent (pipeline)                                       │
│  • Clone repo → Agent 1 (blueprint) → Agent 2 (docs) + Agent 3 (slides)  │
│  • Writes to documentation/ and slides/                                  │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    Gemini 2.5 Flash Live API (Vertex AI)
```

- **Frontend**: React app that connects to the WebSocket proxy, renders slides (markdown), and manages presentation state (explanation vs Q&A, mute/unmute, slide navigation).
- **Backend**: Single Python process: WebSocket proxy for Gemini Live + HTTP API for content, RAG search, and pipeline job status.
- **Pipeline**: Optional. Run from the UI (“Run pipeline” with a GitHub URL) or skip in dev mode and load existing `documentation/` and `slides/`.

---

## Project Structure

```
├── server.py              # WebSocket proxy + HTTP API (content, RAG, jobs)
├── requirements.txt       # Python deps (websockets, google-auth, chromadb, …)
├── package.json           # Frontend (React, Vite, react-markdown, react-icons)
├── vite.config.js
├── index.html
├── src/
│   ├── App.jsx            # Page state: input → running → dashboard
│   ├── main.jsx
│   ├── components/
│   │   ├── LiveAPIDemo.jsx   # Main UI: connect, slides, chat, presentation flow
│   │   ├── SlideCanvas.jsx   # Renders a single slide (markdown, 16:9)
│   │   ├── GitHubInputPage.jsx
│   │   ├── PipelineProgress.jsx
│   │   └── …
│   └── utils/
│       ├── gemini-api.js     # GeminiLiveAPI, message parsing, tool response
│       ├── media-utils.js    # AudioStreamer, AudioPlayer (mic, playback, mute)
│       └── tools.js         # SwitchSlideTool, SearchDocsTool, DownloadContentTool
├── public/
│   └── audio-processors/   # Worklets: capture, playback
├── combined_workflow_sent/ # Doc + slide generation pipeline (Agents 1–3)
├── documentation/          # Generated or sample .md docs (RAG source)
├── slides/                 # Generated or sample slides (per module)
├── README.md               # This file
└── GETTING_STARTED.md      # Step-by-step run guide
```

---

## Key Components

### `LiveAPIDemo.jsx`

- **Connection**: WebSocket URL (default `ws://localhost:8080`), model, voice, config (proactivity, VAD).
- **Content**: Fetches `/content` (docs + slides + project name) for system prompt and sidebar.
- **Presentation**: “Play” on a module → start presentation for that module; state machine: **State A** (explaining slide, mic muted), **State B** (consent/Q&A, mic unmuted after agent finishes), **State C** (pending `switch_slide`). Mute/unmute and “do not call tools during explanation” keep interruptions under control.
- **Tools**: `switch_slide`, `search_documentation`, `download_content` (transcript/video).

### `server.py`

- **WebSocket**: Proxies to Gemini Live API; uses Google default credentials.
- **HTTP**: Serves static assets, `GET /content`, `GET /search-docs?q=...`, `POST /run-pipeline`, `GET /pipeline-status/:jobId`. Builds system prompt from loaded docs/slides and project name.
- **ChromaDB**: Indexes docs/slides; RAG returns top chunks for `search_documentation`.

### Pipeline (`combined_workflow_sent`)

- Clones repo, runs blueprint agent, then doc and slide agents; writes to `documentation/` and `slides/` under the workspace root.

---

## Configuration

- **Dev mode**: Set `VITE_DEV_SKIP_PIPELINE=true` or run in Vite dev so the app skips GitHub input and goes straight to the dashboard, loading existing `documentation/` and `slides/`.
- **Gemini**: Use a GCP project with Vertex AI and Gemini Live API enabled; `gcloud auth application-default login` (or a service account) for `server.py`.
- **Ports**: WebSocket `8080`, HTTP `8081` (content, search, pipeline). Change in `server.py` and in the frontend (`CONTENT_API_URL`, proxy URL, `SEARCH_API_URL`).

---

## Quick Start

See **[GETTING_STARTED.md](./GETTING_STARTED.md)** for step-by-step setup and run instructions.

---

## License

Use and adapt as needed for the hackathon and beyond.
