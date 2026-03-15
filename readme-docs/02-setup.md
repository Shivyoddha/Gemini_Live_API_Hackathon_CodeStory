# CodeStory — Setup

Step-by-step setup for running CodeStory locally: prerequisites, environment, backend, frontend, and optional features.

---

## Prerequisites

- **Node.js** 18 or newer (for the React app).
- **Python** 3.10+ (for the server and pipeline).
- **Google Cloud** project with Vertex AI API (and/or Gemini API) enabled, and credentials that can call the Live API.
- **Git** (for cloning repos in the pipeline).

---

## 1. Clone the repository

```bash
git clone https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory.git
cd Gemini_Live_API_Hackathon_CodeStory
```

---

## 2. Python environment (backend + pipeline)

From the **project root**:

```bash
python -m venv .venv
source .venv/bin/activate   # Linux/macOS; Windows: .venv\Scripts\activate

pip install -r app/requirements.txt
pip install -r pipeline/requirements.txt
```

**Optional — Doc search (ChromaDB):**  
`pip install chromadb` so the agent can search across all documentation. The server uses it when available.

---

## 3. Google Cloud authentication

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

For the **pipeline**, add a `.env` at project root (or in `pipeline`):

```
GEMINI_API_KEY=your_api_key_here
```

---

## 4. Start the backend server

```bash
source .venv/bin/activate
cd app
python server.py
```

Leave running. You should see WebSocket on port 8080 and HTTP on 8081.

---

## 5. Start the frontend

New terminal:

```bash
cd app
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:5173).

---

## 6. Verify

- Open `http://localhost:8081/content` — JSON with `docs` and `slides`.
- In the app, click **Connect** and allow microphone; transcript should show "Ready!".

---

## Dev mode (skip pipeline)

Set `VITE_DEV_SKIP_PIPELINE=true` or run with Vite dev; the app opens on the dashboard and loads existing `documentation/` and `slides/` from the workspace root.

---

## Ports

| Port | Service |
|------|--------|
| 5173 | Vite (frontend) |
| 8080 | WebSocket proxy (Gemini Live) |
| 8081 | Content API |

---

Next: [Architecture](03-architecture.md).
