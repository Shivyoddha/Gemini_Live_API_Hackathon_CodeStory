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
USE_VERTEXAI = os.getenv("GEMINI_USE_VERTEXAI", "false").lower() == "true"

# Models supporting bidiGenerateContent (Live API):
#   AI Studio: gemini-2.5-flash-native-audio-latest, gemini-2.0-flash-exp-image-generation
#   Vertex AI: gemini-2.5-flash-live-001
GEMINI_MODEL = (
    "gemini-2.5-flash-live-001" if USE_VERTEXAI
    else "gemini-2.5-flash-native-audio-latest"
)

# Persona system prompts
PERSONA_PROMPTS = {
    "architect": (
        "You are 'The Architect', an expert software architect narrating this codebase live to a developer. "
        "CRITICAL PACING RULES:\n"
        "1. Speak SLOWLY and clearly. After each key point, PAUSE and say 'Feel free to ask a question or say continue.' "
        "2. ALWAYS call render_slide FIRST with the content, THEN speak about it — so the slide appears before your narration. "
        "3. Cover ONE component per turn, then STOP and wait for the user to respond (say continue or ask a question). "
        "4. Keep each narration segment to 30-45 seconds max before pausing. "
        "5. If the user speaks mid-narration, IMMEDIATELY stop and address their question before continuing. "
        "Focus on design patterns, system trade-offs, and architectural decisions."
    ),
    "debugger": (
        "You are 'The Debugger', a meticulous senior engineer analyzing this codebase. "
        "CRITICAL PACING RULES:\n"
        "1. Speak SLOWLY. After identifying each issue, PAUSE and ask if they want to dig deeper. "
        "2. Call render_slide FIRST with the relevant code, THEN explain the issue. "
        "3. Cover ONE bug or edge case per turn, then stop and wait. "
        "Focus on edge cases, error handling, potential bugs, and logical pitfalls."
    ),
    "historian": (
        "You are 'The Historian', a software storyteller tracing the evolution of this codebase. "
        "CRITICAL PACING RULES:\n"
        "1. Speak SLOWLY and conversationally. Pause between each story chapter. "
        "2. Call render_slide FIRST with relevant code, THEN tell the story behind it. "
        "3. After each chapter, stop and ask if they want to continue or explore a specific area. "
        "Focus on why certain decisions were made and the evolution of the code."
    ),
}

MODE_INSTRUCTIONS = {
    "architecture": (
        "Start with a brief 2-sentence overview of what this repo does. "
        "Then say: 'I'll walk you through the architecture one component at a time. Say continue after each section, or ask me anything.' "
        "For each component: (1) call render_slide with the code FIRST, (2) then narrate for 20-30 seconds, (3) then STOP and wait. "
        "Do NOT rush through everything at once. Cover entry points first, then core services, then utilities."
    ),
    "flow": (
        "Ask the user which specific flow they want to trace (authentication, API request, etc.). "
        "Wait for their response. Then trace that flow step by step. "
        "For each step: call render_slide FIRST, then narrate briefly, then pause."
    ),
    "qa": (
        "Wait for the user's question. Answer concisely and specifically. "
        "Use render_slide to show relevant code when answering. "
        "After each answer, wait — do NOT volunteer more information unless asked. "
        "Adjust technical depth based on how the user asks their questions."
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

        # Use Vertex AI (OAuth2/ADC) or AI Studio (API key)
        if USE_VERTEXAI:
            client = genai.Client(vertexai=True, project=GCP_PROJECT, location=GCP_LOCATION)
            logger.info(f"Using Vertex AI client for session {session_id}")
        else:
            client = genai.Client(api_key=GEMINI_API_KEY)
            logger.info(f"Using AI Studio client (api_key) for session {session_id}")

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
                """Relay browser audio/text/video → Gemini Live API."""
                while True:
                    try:
                        raw = await websocket.receive_text()
                        msg = json.loads(raw)

                        if msg["type"] == "audio_chunk":
                            # Convert list of ints back to bytes (16kHz PCM)
                            pcm_bytes = bytes(msg["data"])
                            await gemini_session.send_realtime_input(
                                audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                            )

                        elif msg["type"] == "video_frame":
                            # Camera frame from user: data URL "data:image/jpeg;base64,..."
                            try:
                                data_url = msg["data"]
                                if "base64," in data_url:
                                    b64_data = data_url.split("base64,")[1]
                                    frame_bytes = base64.b64decode(b64_data)
                                    await gemini_session.send_realtime_input(
                                        video=types.Blob(data=frame_bytes, mime_type="image/jpeg")
                                    )
                            except Exception as ve:
                                logger.debug(f"Video frame error: {ve}")

                        elif msg["type"] == "text_input":
                            # Use send_realtime_input (NOT send_client_content) to keep VAD
                            # streaming mode active — this allows tool/function calls to fire
                            await gemini_session.send_realtime_input(text=msg["text"])
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
                        # ── Audio: for native-audio model, audio is in inline_data of model_turn parts
                        if response.server_content and response.server_content.model_turn:
                            for part in response.server_content.model_turn.parts:
                                if part.inline_data and part.inline_data.data:
                                    audio_buffer.extend(part.inline_data.data)
                                    logger.debug(f"Audio chunk: {len(part.inline_data.data)} bytes, buffer={len(audio_buffer)}")
                                    # Send in 4096-byte chunks (~85ms at 24kHz) for low-latency
                                    if len(audio_buffer) >= 4096:
                                        import base64 as b64mod
                                        await websocket.send_json({
                                            "type": "audio_output",
                                            "data": b64mod.b64encode(bytes(audio_buffer)).decode("ascii"),
                                            "sample_rate": 24000,
                                        })
                                        audio_buffer.clear()
                            await websocket.send_json({"type": "agent_speaking", "value": True})

                        # ── Also check response.data directly (fallback for other models)
                        elif response.data:
                            audio_buffer.extend(response.data)
                            if len(audio_buffer) >= 4096:
                                import base64 as b64mod
                                await websocket.send_json({
                                    "type": "audio_output",
                                    "data": b64mod.b64encode(bytes(audio_buffer)).decode("ascii"),
                                    "sample_rate": 24000,
                                })
                                audio_buffer.clear()
                            await websocket.send_json({"type": "agent_speaking", "value": True})

                        # ── Server content: transcriptions and turn completion
                        if response.server_content:
                            sc = response.server_content

                            # Output transcription (what agent said)
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

                            # Turn complete — flush remaining audio buffer
                            if sc.turn_complete:
                                if audio_buffer:
                                    import base64 as b64mod
                                    await websocket.send_json({
                                        "type": "audio_output",
                                        "data": b64mod.b64encode(bytes(audio_buffer)).decode("ascii"),
                                        "sample_rate": 24000,
                                    })
                                    audio_buffer.clear()
                                await websocket.send_json({"type": "agent_speaking", "value": False})
                                logger.info(f"Turn complete for session {session_id}")

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
