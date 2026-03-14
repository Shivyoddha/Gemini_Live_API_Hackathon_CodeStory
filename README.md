# CodeStory

**Turn any GitHub repo into an interactive, voice-narrated code walkthrough.**

CodeStory clones a repository, generates structured documentation and presentation slides, then lets you explore them with a **Gemini Live API**–powered voice assistant. Ask questions, jump between slides, and get answers grounded in your docs—all through natural conversation.

![CodeStory](logo.png)

---

## What CodeStory Does

1. **Paste a GitHub URL** — CodeStory clones the repo and runs a pipeline to generate:
   - **Documentation** — Markdown docs per topic (architecture, APIs, data models, etc.).
   - **Slides** — Module-based slide decks for each section.
2. **Dashboard** — Browse modules and slides, open per-module documentation (with Mermaid diagram support).
3. **Voice assistant** — Connect to Gemini Live; the agent explains slides, answers questions using the docs, and can switch slides or search documentation on demand.
4. **Transcript & Chat** — See the conversation in the side panel; type follow-up questions or rely on voice.

| Feature | Description |
|--------|-------------|
| **Live voice narration** | Gemini 2.5 Flash Live API speaks slide content in real time. |
| **Slide-based walkthrough** | Documentation and slides generated from the repo; the AI explains slide-by-slide. |
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

---

## Quick Start

**Prerequisites:** Node.js 18+, Python 3.10+, [Google Cloud project](https://console.cloud.google.com/) with Vertex AI / Gemini API enabled.

```bash
# 1. Clone this repo
git clone https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory.git
cd Gemini_Live_API_Hackathon_CodeStory

# 2. Backend (from project root)
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r react-demo-app/requirements.txt
pip install -r combined_workflow_sent/requirements.txt
# Optional: pip install chromadb   for doc search
gcloud auth application-default login

# 3. Start the server (WebSocket proxy + Content API)
cd react-demo-app && python server.py
# Leave running. You should see: WebSocket ws://localhost:8080, HTTP http://localhost:8081

# 4. Frontend (new terminal)
cd react-demo-app
npm install
npm run dev
# Open http://localhost:5173
```

- **First screen:** Enter a GitHub repo URL (or use **Dev mode** to skip the pipeline and go straight to the dashboard with existing `documentation/` and `slides/`).
- **Dashboard:** Pick a module, use ▶ to start a voice walkthrough, or 📄 to open that module’s documentation.
- **Connect:** Click **Connect** in the navbar and allow microphone access to talk to the agent.

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Onboarding](readme-docs/01-onboarding.md) | Who CodeStory is for, concepts, and first-run flow. |
| [Setup](readme-docs/02-setup.md) | Prerequisites, environment, optional ChromaDB, and running server + frontend. |
| [Architecture](readme-docs/03-architecture.md) | Repo layout, pipeline, Content API, and Gemini Live integration. |
| [Code reference](readme-docs/04-code-reference.md) | Main components, APIs, and tools (switch_slide, search_docs, download_content). |
| [Troubleshooting](readme-docs/05-troubleshooting.md) | Common issues, ports, and logs. |

---

## Project layout

```
├── README.md                 ← You are here
├── readme-docs/              ← Detailed docs (onboarding, setup, architecture, code, troubleshooting)
├── react-demo-app/           ← React UI + server (WebSocket proxy, Content API, pipeline launcher)
├── combined_workflow_sent/   ← Pipeline: clone repo → generate docs + slides
├── documentation/            ← Generated or hand-written Markdown docs (per module)
├── slides/                   ← Generated or hand-written slides (per module)
└── logo.png
```

---

## Tech stack

- **Frontend:** React 19, Vite 7, react-markdown, Mermaid, react-icons
- **Backend:** Python 3 (HTTP server + WebSocket proxy), Google Auth, ChromaDB (optional, for doc search)
- **Voice:** Google Vertex AI Gemini Live API (real-time bidirectional audio)
- **Pipeline:** Python agents (Gemini) for documentation and slide generation

---

## License

See repository license file.
