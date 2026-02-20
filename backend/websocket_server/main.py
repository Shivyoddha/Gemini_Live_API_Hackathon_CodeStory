"""
CodeStory WebSocket Server — bridges browser audio/text to Gemini 2.5 Flash Live API.

Architecture:
  Browser  ←→  WebSocket (this server)  ←→  Gemini Live API (Vertex AI)
                                          ↕
                               Reasoning Engine (tool calls)
"""

import asyncio
import base64
import json
import os
import struct
import uuid
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from dotenv import load_dotenv

from tools.slide_tools import handle_tool_call
from tools.session_store import SessionStore

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GCP_PROJECT = os.getenv("GCP_PROJECT_ID", "gemini-live-api-hackathon")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
GEMINI_MODEL = "gemini-2.5-flash-live-001"  # Gemini 2.5 Flash Live

# Persona system prompts
PERSONA_PROMPTS = {
    "architect": (
        "You are 'The Architect', an expert software architect narrating this codebase. "
        "Focus on high-level design patterns, system trade-offs, and architectural decisions. "
        "Use clear, engaging language. Speak in a calm, authoritative tone. "
        "When you want to show a slide or diagram, use the render_slide or generate_mermaid_flow tools."
    ),
    "debugger": (
        "You are 'The Debugger', a meticulous senior engineer analyzing this codebase. "
        "Focus on edge cases, error handling, potential bugs, and logical pitfalls. "
        "Be precise and technical. Highlight risks and suggest improvements. "
        "When you want to show a slide or diagram, use the render_slide or generate_mermaid_flow tools."
    ),
    "historian": (
        "You are 'The Historian', a software storyteller tracing the evolution of this codebase. "
        "Focus on why certain decisions were made, the evolution of the code, git insights, and context. "
        "Tell the story behind the code with richness and depth. "
        "When you want to show a slide or diagram, use the render_slide or generate_mermaid_flow tools."
    ),
}

MODE_INSTRUCTIONS = {
    "architecture": (
        "Begin with a high-level architectural overview. Identify entry points (main.py, index.js, app.py, etc.) "
        "and narrate the flow from there. Use render_slide frequently to show slides about each component. "
        "Start immediately without waiting for user prompts."
    ),
    "flow": (
        "Ask the user which flow they want to explore (e.g., 'authentication', 'payment', 'API request lifecycle'). "
        "Then trace that flow end-to-end across all modules using the find_dependencies tool. "
        "Generate sequence diagrams showing the request lifecycle."
    ),
    "qa": (
        "Wait for the user's questions. Answer anything about the repository using your knowledge graph. "
        "Adjust technical depth based on the user's apparent expertise level (Affective Dialog). "
        "Reference specific files, line numbers, and functions in your answers."
    ),
}

# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="CodeStory WebSocket Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

session_store = SessionStore()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "codestory-websocket-server"}


@app.websocket("/ws/session/{session_id}")
async def websocket_session(
    websocket: WebSocket,
    session_id: str,
    mode: str = Query("architecture"),
    persona: str = Query("architect"),
):
    await websocket.accept()
    logger.info(f"Session {session_id} connected | mode={mode} persona={persona}")

    # Build the system prompt
    system_prompt = (
        f"{PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS['architect'])}\n\n"
        f"## Session Mode\n{MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS['architecture'])}\n\n"
        f"## Knowledge Graph\n"
        f"You have access to the CodeStory Spanner Graph knowledge base for this session. "
        f"Use the find_dependencies tool to retrieve code structure information. "
        f"Session ID: {session_id}"
    )

    # Tool declarations for Gemini function calling
    tools_declaration = [
        {
            "name": "render_slide",
            "description": "Render a new slide in the UI with header, code snippet, and narrative notes.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "header": {"type": "STRING", "description": "The slide title/header concept"},
                    "code_language": {"type": "STRING", "description": "Programming language of the code snippet"},
                    "code_content": {"type": "STRING", "description": "The code snippet to display"},
                    "code_file": {"type": "STRING", "description": "File path of the code"},
                    "code_lines": {"type": "STRING", "description": "Line range e.g. '10-45'"},
                    "narrative_notes": {"type": "STRING", "description": "Context/explanation for this slide"},
                },
                "required": ["header"],
            },
        },
        {
            "name": "generate_mermaid_flow",
            "description": "Generate and display a Mermaid.js diagram (flowchart, sequence, or architecture).",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "diagram_type": {"type": "STRING", "description": "Type: flowchart, sequence, or architecture"},
                    "mermaid_code": {"type": "STRING", "description": "Valid Mermaid.js diagram syntax"},
                    "title": {"type": "STRING", "description": "Title for the diagram"},
                },
                "required": ["mermaid_code", "title"],
            },
        },
        {
            "name": "find_dependencies",
            "description": "Query the Spanner Graph knowledge base to find code dependencies, callers, or related nodes.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "entity_name": {"type": "STRING", "description": "Class, method, or file name to search for"},
                    "relationship": {"type": "STRING", "description": "Relationship type: CALLS, IMPORTS, EXTENDS, DECLARES"},
                    "depth": {"type": "INTEGER", "description": "Traversal depth (1-3)"},
                },
                "required": ["entity_name"],
            },
        },
        {
            "name": "show_modal",
            "description": "Push an architectural overview modal to the user's screen without interrupting narration.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING", "description": "Modal title"},
                    "content": {"type": "STRING", "description": "Modal content (markdown)"},
                    "visual_type": {"type": "STRING", "description": "Type: architecture, summary, overview"},
                },
                "required": ["title", "content"],
            },
        },
    ]

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=system_prompt)],
                role="user",
            ),
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(**t) for t in tools_declaration
            ])],
            realtime_input_config=types.RealtimeInputConfig(
                activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            ),
            session_resumption=types.SessionResumptionConfig(handle=None),
            context_window_compression=types.ContextWindowCompressionConfig(
                trigger_tokens=25000,
                sliding_window=types.SlidingWindow(target_tokens=20000),
            ),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
        )

        async with client.aio.live.connect(model=GEMINI_MODEL, config=config) as gemini_session:
            await websocket.send_json({"type": "session_ready"})
            logger.info(f"Gemini Live session established for {session_id}")

            async def browser_to_gemini():
                """Relay browser audio/text → Gemini Live API."""
                while True:
                    try:
                        raw = await websocket.receive_text()
                        msg = json.loads(raw)

                        if msg["type"] == "audio_chunk":
                            # Convert list of ints back to bytes
                            pcm_bytes = bytes(msg["data"])
                            await gemini_session.send(
                                input=types.RealtimeInput(
                                    audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                                )
                            )

                        elif msg["type"] == "text_input":
                            await gemini_session.send(
                                input=msg["text"], end_of_turn=True
                            )
                            await websocket.send_json({
                                "type": "transcript",
                                "role": "user",
                                "text": msg["text"],
                            })

                    except WebSocketDisconnect:
                        logger.info(f"Browser disconnected: {session_id}")
                        break
                    except Exception as e:
                        logger.error(f"browser_to_gemini error: {e}")
                        break

            async def gemini_to_browser():
                """Relay Gemini Live API responses → browser."""
                audio_buffer = bytearray()

                async for response in gemini_session.receive():
                    try:
                        # Handle audio data
                        if response.data:
                            audio_buffer.extend(response.data)
                            # Send in chunks for low-latency playback
                            if len(audio_buffer) >= 4096:
                                await websocket.send_json({
                                    "type": "audio_output",
                                    "data": list(audio_buffer),
                                    "sample_rate": 24000,
                                })
                                audio_buffer.clear()
                            await websocket.send_json({"type": "agent_speaking", "value": True})

                        # Handle server content (transcriptions, text)
                        if response.server_content:
                            sc = response.server_content

                            # Output transcription
                            if sc.output_transcription and sc.output_transcription.text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "role": "agent",
                                    "text": sc.output_transcription.text,
                                })

                            # Input transcription (what user said)
                            if sc.input_transcription and sc.input_transcription.text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "role": "user",
                                    "text": sc.input_transcription.text,
                                })

                            # Turn complete — flush audio
                            if sc.turn_complete:
                                if audio_buffer:
                                    await websocket.send_json({
                                        "type": "audio_output",
                                        "data": list(audio_buffer),
                                        "sample_rate": 24000,
                                    })
                                    audio_buffer.clear()
                                await websocket.send_json({"type": "agent_speaking", "value": False})

                        # Handle function/tool calls
                        if response.tool_call:
                            for fc in response.tool_call.function_calls:
                                logger.info(f"Tool call: {fc.name} args={fc.args}")
                                result = await handle_tool_call(
                                    fc.name, fc.args, session_id, websocket
                                )
                                # Return tool result to Gemini
                                await gemini_session.send(
                                    input=types.LiveClientToolResponse(
                                        function_responses=[
                                            types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={"result": result},
                                            )
                                        ]
                                    )
                                )

                        # Session resumption token
                        if response.session_resumption_update:
                            token = response.session_resumption_update.new_handle
                            if token:
                                await session_store.save_token(session_id, token)
                                logger.debug(f"Session resumption token saved for {session_id}")

                    except Exception as e:
                        logger.error(f"gemini_to_browser error: {e}")
                        break

            # Run both directions concurrently
            await asyncio.gather(
                browser_to_gemini(),
                gemini_to_browser(),
            )

    except WebSocketDisconnect:
        logger.info(f"Session {session_id} disconnected normally.")
    except Exception as e:
        logger.error(f"Session {session_id} fatal error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        logger.info(f"Session {session_id} cleaned up.")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
