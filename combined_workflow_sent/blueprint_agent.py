"""
blueprint_agent.py
------------------
Agent 1 — Blueprint Generator.

Changes from original:
  • Fixed model name: "gemini-3-flash-preview" → "gemini-2.5-flash" (bug fix).
  • generate_dynamic_blueprint now accepts PipelineContext and reads
    ctx.repo_contents instead of re-reading the repository from disk.
  • parse_blueprint retries the agent once on JSON parse failure before raising,
    making the pipeline resilient to occasional malformed model outputs.
  • Uses run_agent_query_with_retry instead of the bare run_agent_query.
  • Agent instruction is byte-for-byte identical to the original.
"""

from __future__ import annotations

import json
import re

from google.adk.agents import Agent

from common import ensure_api_key, log, make_session_service, run_agent_query_with_retry


# ---------------------------------------------------------------------------
# Agent factory  (prompt unchanged)
# ---------------------------------------------------------------------------


def create_blueprint_generator_agent() -> Agent:
    """Create the Blueprint Generator agent."""
    return Agent(
        name="blueprint_generator_agent",
        model="gemini-2.5-flash",   # Fixed: was "gemini-3-flash-preview" (non-existent)
        description="Generates dynamic slide blueprint from repository evidence.",
        instruction="""
You are a Repository Structure Analyst.

Your task:
Generate a SLIDE_BLUEPRINT Python list based strictly on repository evidence.

======================================================
🚨 STRICT ANTI-HALLUCINATION RULES (MANDATORY)
======================================================

1. Use ONLY the repository contents provided.
2. Do NOT assume common stacks or patterns.
3. Do NOT fabricate architecture, tools, or layers.
4. Every section must be grounded in observable repository evidence.
5. If evidence is weak or minimal, DO NOT create a separate section for it.

======================================================
MANDATORY SECTIONS (ALWAYS INCLUDE)
======================================================

The following sections MUST always exist:

1. Project Overview
   → High-level explanation of repository purpose based strictly on README, code structure, and naming.

2. Business Value
   → Practical or organizational value inferred strictly from repository purpose and functionality.

3. System Architecture
   → Structural architecture inferred strictly from directory layout and module relationships.

======================================================
DYNAMIC SECTION GENERATION RULES
======================================================

After the 3 mandatory sections:

• Dynamically generate additional sections ONLY if strongly supported by repository evidence.
• Section titles must reflect actual repository characteristics.
• Do NOT use generic section names unless clearly justified by evidence.

Examples (do NOT blindly copy these):
- REST API Design
- React Frontend Architecture
- Database Schema Design
- CLI Command Structure
- Machine Learning Training Pipeline
- Background Job Processing
- Dockerized Deployment Strategy
- Testing Infrastructure
- Configuration Management
- Plugin Framework

======================================================
SECTION QUALITY CONTROL
======================================================

If a potential section:

• Has very limited evidence
• Covers only a small utility file
• Would result in only 1–2 weak slides

Then:

→ Merge it into a broader relevant section.
→ Avoid micro-sections.

The blueprint should contain:
• Only meaningful, presentation-worthy sections
• No tiny or filler sections
• No redundant sections

======================================================
OUTPUT FORMAT (STRICT)
======================================================

Return ONLY valid JSON.

Output format:

{
  "SLIDE_BLUEPRINT": [
    {"title": "...", "description": "..."}
  ]
}

Rules:
• No commentary
• No markdown
• No explanation
"""
    )


# ---------------------------------------------------------------------------
# Blueprint generation
# ---------------------------------------------------------------------------


async def generate_dynamic_blueprint(
    ctx,  # PipelineContext — avoids circular import with type annotation
    blueprint_agent: Agent,
) -> str:
    """Generate the blueprint using repo contents already loaded in *ctx*.

    The ctx.repo_contents string is built once by main.py and reused here,
    so the repository is never re-read from disk by this agent.
    """
    ensure_api_key()

    session_service = make_session_service()
    session = await session_service.create_session(
        app_name=blueprint_agent.name,
        user_id=ctx.user_id,
    )

    query = (
        "Analyze the following repository contents and generate a "
        "structured SLIDE_BLUEPRINT Python list strictly based on "
        "repository evidence.\n\n"
        "==================== REPOSITORY START ====================\n"
        f"{ctx.repo_contents}\n"
        "==================== REPOSITORY END ====================\n"
    )

    log("INFO", "Generating blueprint…")

    blueprint_text = await run_agent_query_with_retry(
        blueprint_agent,
        query,
        session,
        ctx.user_id,
        verbose=False,
    )

    log("INFO", "Blueprint generated ✅")
    return blueprint_text


# ---------------------------------------------------------------------------
# Blueprint parsing  (with one auto-retry on parse failure)
# ---------------------------------------------------------------------------


def parse_blueprint(blueprint_text: str) -> list[dict]:
    """Parse the JSON output from the blueprint agent.

    Strips optional markdown fences then attempts json.loads.  Returns the
    inner SLIDE_BLUEPRINT list on success.
    """
    cleaned = re.sub(r"```(?:python|json)?", "", blueprint_text)
    cleaned = cleaned.replace("```", "").strip()

    try:
        data = json.loads(cleaned)
        return data["SLIDE_BLUEPRINT"]
    except Exception as e:
        log("WARN", f"Blueprint parse failed: {e}")
        log("WARN", f"Raw output (first 500 chars):\n{cleaned[:500]}")
        raise


async def generate_dynamic_blueprint_with_parse_retry(
    ctx,
    blueprint_agent: Agent,
) -> list[dict]:
    """Generate blueprint and parse it, retrying agent call once on parse failure."""
    for attempt in range(2):
        raw_text = await generate_dynamic_blueprint(ctx, blueprint_agent)
        try:
            return parse_blueprint(raw_text), raw_text
        except Exception:
            if attempt == 0:
                log("WARN", "Retrying blueprint generation after parse failure…")
            else:
                raise
    raise RuntimeError("Unreachable")
