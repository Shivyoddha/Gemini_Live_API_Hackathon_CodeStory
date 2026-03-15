# CodeStory Architecture (Hackathon)

This diagram shows how Gemini and the backend connect for judges. Export as PNG for Devpost (e.g. use [Mermaid Live](https://mermaid.live) or your IDE).

```mermaid
flowchart LR
  subgraph Browser [Browser]
    React[React + Vite]
    React -->|GitHub URL, dashboard, voice UI| React
  end

  subgraph GCP [Google Cloud]
    subgraph CloudRun [Cloud Run]
      Server[server.py]
      Server -->|WebSocket proxy + auth| Server
      Server -->|HTTP: content, pipeline, search| Server
    end
    subgraph Vertex [Vertex AI]
      LiveAPI[Gemini Live API]
      Gemini[Gemini 2.5 Flash]
    end
    subgraph Pipeline [ADK Pipeline]
      A1[Agent 1: Blueprint]
      A2[Agent 2: Docs]
      A3[Agent 3: Slides]
      A1 --> A2
      A1 --> A3
    end
  end

  Browser -->|wss://.../ws audio + tools| CloudRun
  Browser -->|https://... content, jobs| CloudRun
  CloudRun -->|BidiGenerateContent| LiveAPI
  CloudRun -->|subprocess| Pipeline
  Pipeline -->|generate_content| Gemini
```

- **Browser:** React app (GitHub URL, dashboard, voice UI, transcript).
- **Cloud Run:** Backend (server.py) — WebSocket proxy to Vertex, HTTP Content API, pipeline launcher.
- **Vertex AI:** Gemini Live API (real-time voice), Gemini 2.5 Flash (pipeline).
- **ADK Pipeline:** Three agents (blueprint → docs + slides) built with Google ADK.
