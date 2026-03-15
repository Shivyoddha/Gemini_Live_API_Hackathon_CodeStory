# CodeStory — Onboarding

This document explains who CodeStory is for, the main concepts, and what to expect on first run.

---

## Who is CodeStory for?

- **Developers** who want to quickly understand a new codebase via narrated walkthroughs and Q&A.
- **Tech leads** who need to onboard others with consistent, generated docs and slides.
- **Anyone** who prefers talking to an AI over reading long markdown files—with answers grounded in the project’s own documentation.

CodeStory is not a generic chatbot: it is wired to **your repo’s docs and slides**, so explanations and answers are scoped to the project.

---

## Core concepts

### 1. Pipeline (docs + slides generation)

When you submit a GitHub URL, CodeStory:

1. Clones the repository.
2. Runs a **pipeline** (`pipeline`) that uses Gemini to:
   - Analyze the codebase and produce **documentation** (Markdown files in `documentation/`).
   - Generate **slides** (Markdown files in `slides/`, grouped by **module**).

The pipeline can take a few minutes. You can also skip it in **dev mode** and use pre-existing `documentation/` and `slides/` folders.

### 2. Modules and slides

- **Module** — A topic or section (e.g. “Project overview”, “System architecture”, “User management”). Each module has:
  - A set of **slides** (one or more Markdown files).
  - Optionally a **documentation** file that summarizes or details that topic.
- **Slides** — Individual “pages” the agent can walk through and that you can navigate with Prev/Next or by asking the agent to “go to slide 2”.

The agent is given the current slide content and doc context so it can explain and answer questions accurately.

### 3. Voice assistant (Gemini Live API)

After you **Connect** in the UI:

- Your **microphone** stream is sent to Google’s Gemini Live API (via the local WebSocket proxy that handles auth).
- The model responds with **audio** (and optionally text), which is played back.
- You can **interrupt** at any time; the agent can **switch slides** or **search documentation** via tools when needed.

So the “chat” is primarily voice, with a **Transcript & Chat** panel showing what was said and letting you type follow-ups.

### 4. Transcript & Chat panel

- **Transcript** — Shows the conversation: your utterances (right-aligned) and the agent’s (left-aligned). System messages (e.g. “Navigated to slide 2”) are centered.
- **Chat** — A text box and Send button at the bottom let you type questions instead of (or in addition to) speaking.

---

## First-run flow

1. **Start server and frontend** (see [Setup](02-setup.md)).
2. **Open the app** (e.g. `http://localhost:5173`).
3. **Choose mode:**
   - **Normal:** Enter a GitHub repo URL → pipeline runs (clone + docs + slides) → when done, you’re taken to the dashboard.
   - **Dev mode:** If `VITE_DEV_SKIP_PIPELINE=true` or running in Vite dev, the app can open directly on the dashboard and load existing `documentation/` and `slides/` from disk.
4. **Dashboard:**
   - Left: list of **modules**. For each module you have:
     - A **row** to select that module (and see its slides).
     - A **Doc** button (📄) to open that module’s documentation in the main area.
     - A **Play** button (▶) to start a voice-narrated walkthrough of that module’s slides.
   - Center: **slide canvas** (or doc view when you clicked 📄). Below it: **mic**, **volume**, and **share screen** controls.
   - Right: **Transcript & Chat** panel.
5. **Connect** — Click **Connect** in the navbar. Allow microphone access. Wait for “Ready!” in the transcript.
6. **Use the assistant:**
   - Click ▶ on a module to have the agent explain the slides in order.
   - Ask questions by voice or in the chat box; the agent can switch slides or search docs when relevant.
   - Use the Doc button to read the full documentation for a module (with Mermaid diagrams if present).

---

## What the agent can do (tools)

- **switch_slide** — Navigate to a given module and slide number (e.g. to show you something specific).
- **search_documentation** — Query the vector index (ChromaDB) for relevant doc/slide chunks when the answer isn’t in the current context.
- **download_content** — After you say you want a transcript or video, the agent can trigger a download (transcript as Markdown or recording as WebM).

These are described in more detail in [Code reference](04-code-reference.md).

---

## Next steps

- [Setup](02-setup.md) — Install dependencies, credentials, and run server + frontend.
- [Architecture](03-architecture.md) — How the repo is structured and how the pieces fit together.
- [Code reference](04-code-reference.md) — Where to find and how to work with the main code.
