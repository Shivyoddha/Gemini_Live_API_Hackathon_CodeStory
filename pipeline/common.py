"""
common.py
---------
Shared infrastructure for the three-agent documentation pipeline.

Changes from original:
  • Each agent gets its own InMemorySessionService (no global singleton) to
    prevent cross-agent session contamination.
  • run_agent_query_with_retry wraps every API call with exponential back-off so
    transient 429 / 500 / 503 errors do not abort the whole pipeline.
  • log() is a thin structured logger that can be swapped for the stdlib logging
    module later without touching any call sites.
  • The original run_agent_query is kept for backwards compatibility.
"""

from __future__ import annotations

import asyncio
import os
import time
from getpass import getpass

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LEVELS = {"DEBUG": 0, "INFO": 1, "WARN": 2, "ERROR": 3}
_MIN_LEVEL = LEVELS["INFO"]


def log(level: str, msg: str) -> None:
    """Structured logger. Drop-in replacement for print() across all modules."""
    if LEVELS.get(level.upper(), 1) >= _MIN_LEVEL:
        tag = {"INFO": "ℹ️", "WARN": "⚠️", "ERROR": "❌", "DEBUG": "🔍"}.get(
            level.upper(), "•"
        )
        print(f"{tag}  [{level.upper()}]  {msg}")


# ---------------------------------------------------------------------------
# API key helper
# ---------------------------------------------------------------------------


def ensure_api_key() -> str:
    # Prefer GEMINI_API_KEY (shared with web app), fall back to GOOGLE_API_KEY.
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        api_key = getpass("Enter your Google API Key: ")
        log("INFO", "API Key configured.")
    else:
        log("INFO", "Using GEMINI_API_KEY / GOOGLE_API_KEY from environment.")
    os.environ["GOOGLE_API_KEY"] = api_key
    os.environ["GEMINI_API_KEY"] = api_key
    return api_key


# ---------------------------------------------------------------------------
# Session factory  (each call returns a fresh, isolated service)
# ---------------------------------------------------------------------------


def make_session_service() -> InMemorySessionService:
    """Return a brand-new InMemorySessionService.

    Agents should call this rather than sharing the module-level singleton so
    that sessions from one agent cannot interfere with another.
    """
    return InMemorySessionService()


# ---------------------------------------------------------------------------
# Core query helper — with retry / back-off
# ---------------------------------------------------------------------------

_RETRYABLE_PHRASES = ("429", "500", "503", "quota", "rate", "resource exhausted")


async def run_agent_query_with_retry(
    agent,
    query: str,
    session,
    user_id: str,
    *,
    verbose: bool = False,
    retries: int = 3,
    backoff: float = 2.0,
) -> str:
    """Run an ADK agent query, retrying on transient API errors.

    Parameters
    ----------
    retries:
        Maximum number of additional attempts after the first failure.
    backoff:
        Base seconds for exponential back-off (attempt n waits backoff**n s).
    """
    session_service = make_session_service()

    # Re-create the session in the new isolated service
    fresh_session = await session_service.create_session(
        app_name=agent.name,
        user_id=user_id,
    )

    last_exc: Exception | None = None

    for attempt in range(retries + 1):
        try:
            runner = Runner(
                agent=agent,
                session_service=session_service,
                app_name=agent.name,
            )

            final_response = ""
            async for event in runner.run_async(
                user_id=user_id,
                session_id=fresh_session.id,
                new_message=Content(parts=[Part(text=query)], role="user"),
            ):
                if verbose:
                    print(event)
                if event.is_final_response():
                    final_response = event.content.parts[0].text

            return final_response

        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            exc_str = str(exc).lower()
            is_retryable = any(p in exc_str for p in _RETRYABLE_PHRASES)

            if not is_retryable or attempt == retries:
                raise

            wait = backoff ** (attempt + 1)
            log("WARN", f"Transient error on attempt {attempt + 1}: {exc}. Retrying in {wait:.0f}s…")
            await asyncio.sleep(wait)

    # Should never reach here, but satisfy the type-checker
    raise RuntimeError("run_agent_query_with_retry exhausted retries") from last_exc


# ---------------------------------------------------------------------------
# Legacy helper — kept for backwards compatibility
# ---------------------------------------------------------------------------

# Shared session service kept only so old call-sites that pass it directly
# do not break before they are migrated.
session_service = InMemorySessionService()


async def run_agent_query(agent, query, session, user_id, *, verbose=False) -> str:
    """Original single-shot query helper (no retry).

    Prefer run_agent_query_with_retry for new call sites.
    """
    runner = Runner(
        agent=agent,
        session_service=session_service,
        app_name=agent.name,
    )

    final_response = ""
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=Content(parts=[Part(text=query)], role="user"),
    ):
        if verbose:
            print(event)
        if event.is_final_response():
            final_response = event.content.parts[0].text

    return final_response