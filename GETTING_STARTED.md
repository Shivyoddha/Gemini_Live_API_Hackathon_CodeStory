# Getting Started — CodeStory

Step-by-step guide to run the CodeStory app (frontend + backend + optional pipeline).

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+
- **Google Cloud** project with:
  - Vertex AI API enabled
  - Gemini Live API access (e.g. Gemini 2.5 Flash)
- **Git** (for cloning repos when using the pipeline)

---

## 1. Clone the repository

```bash
git clone https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory.git
cd Gemini_Live_API_Hackathon_CodeStory
```

---

## 2. Authenticate with Google Cloud

The backend uses Application Default Credentials to call the Gemini Live API.

```bash
gcloud auth application-default login
```

Use a project that has Vertex AI and Gemini enabled. Set the project if needed:

```bash
gcloud config set project YOUR_PROJECT_ID
```

---

## 3. Backend (Python server)

From the **repository root** (same folder as `server.py`):

```bash
# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server (WebSocket on 8080, HTTP on 8081)
python server.py
```

You should see something like:

```
WebSocket server on ws://0.0.0.0:8080
HTTP server on http://0.0.0.0:8081
```

Leave this terminal open.

---

## 4. Frontend (React app)

In a **new terminal**, from the same repository root:

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 5. Using the app

### Without running the pipeline (dev / existing content)

- If you have existing `documentation/` and `slides/` in the repo (or set `VITE_DEV_SKIP_PIPELINE=true`), the app may go straight to the **dashboard**.
- On the dashboard: connect to the WebSocket (default `ws://localhost:8080`), pick model/voice, then click **Connect**. After “Ready!”, use the slides sidebar and **Play** on a module to start a voice-narrated walkthrough.

### With the pipeline (generate docs + slides from a repo)

- On the **first screen**, paste a public GitHub repository URL and start the pipeline.
- Wait for the pipeline to finish (clone → blueprint → docs + slides). When done, you’re taken to the dashboard.
- Loaded content (project name, docs, slides) comes from the backend; start a presentation as above.

### During a presentation

- **Slides**: Use **Prev/Next** or say “go to slide X” (agent can call `switch_slide`).
- **Questions**: When the agent asks “Any questions?”, speak; it will answer then re-ask to continue.
- **Transcript / video**: At the end of a module, the agent can offer download; use the **download_content** tool (transcript or video).

---

## 6. Ports and URLs

| Service        | Default URL              | Purpose                          |
|----------------|--------------------------|----------------------------------|
| WebSocket      | `ws://localhost:8080`    | Gemini Live API proxy            |
| HTTP API       | `http://localhost:8081`  | Content, search-docs, pipeline   |
| Frontend (dev) | `http://localhost:5173`  | Vite dev server                  |

Change WebSocket/HTTP ports in `server.py` (top of file). Update the frontend if you change HTTP/WS ports: `CONTENT_API_URL`, `SEARCH_API_URL`, and the proxy URL in `LiveAPIDemo.jsx`.

---

## 7. Environment variables

- **Backend**: Uses Google Application Default Credentials. Optional: set `GOOGLE_CLOUD_PROJECT` if needed.
- **Pipeline** (when run via “Run pipeline”): Expects `GEMINI_API_KEY` or `GOOGLE_API_KEY` in a `.env` at the repo root (or where the pipeline is run). See `combined_workflow_sent` for pipeline-specific env.

---

## 8. Troubleshooting

| Issue | What to check |
|-------|----------------|
| “Connect” never gets “Ready!” | Backend running? Correct WebSocket URL and GCP auth (`gcloud auth application-default login`). |
| No slides / empty content | Pipeline run successfully? Check `documentation/` and `slides/` exist and that the HTTP server can read them (run from repo root). |
| Interruptions during explanation | Expected behavior is improved by muting the mic while the agent speaks; ensure you’re on the latest frontend. |
| Search / RAG not working | ChromaDB is populated when content is loaded; run pipeline or add docs/slides and reload. |

---

## 9. Build for production

```bash
npm run build
```

Static output is in `dist/`. Serve `dist/` with any static server; point the app to your backend WebSocket and HTTP URLs (you may need to set env or config for production WS/HTTP hosts).

You’re ready to run CodeStory end-to-end.
