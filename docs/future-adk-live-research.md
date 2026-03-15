# Future: ADK Live Stream for Voice Narrator

**Status:** Research task (not required for hackathon submission).

## Goal

The hackathon requires "Agents must be built using either Google GenAI SDK OR ADK." Our **pipeline** agents (blueprint, docs, slides) already use **ADK**. The **real-time voice narrator** currently uses a custom WebSocket client talking to the Vertex AI Gemini Live API (no SDK/ADK in that path).

To align the narrator with ADK as well (optional hardening), we could:

- Use **ADK streaming** so the conversational agent is also ADK-built.
- Reference: [ADK Streaming / Get started](https://google.github.io/adk-docs/get-started/streaming/) — explore whether ADK supports or will support the Gemini Live API (real-time bidirectional audio) and how to run that on the server while streaming to the browser.

## Tasks (when prioritised)

1. Confirm whether ADK’s streaming APIs support the same Live API (BidiGenerateContent) we use today.
2. If yes: implement a server-side ADK (or GenAI SDK) flow that creates the Live session and proxies audio/tool calls to the frontend.
3. If no: keep current WebSocket proxy and rely on pipeline ADK agents for compliance; document clearly in README (already done).

## Notes

- Current compliance: three ADK agents in `pipeline` satisfy “agents built with ADK”; Vertex AI is used for the Live API.
- This doc is for future work only; no code changes required for submission.
