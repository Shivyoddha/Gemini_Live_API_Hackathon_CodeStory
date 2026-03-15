# CodeStory App

Frontend (React + Vite) and backend (Python WebSocket proxy + HTTP Content API) for CodeStory.

**Full setup:** See the [project README](../README.md) for prerequisites, Python env, and running server + frontend from project root.

## Quick run (from project root)

```bash
# Terminal 1 — backend
cd app && pip install -r requirements.txt && python server.py

# Terminal 2 — frontend
cd app && npm install && npm run dev
```

Open http://localhost:5173. Configure Proxy WebSocket URL and GCP project in the navbar before connecting.
