"""
Tool call handlers for the CodeStory WebSocket server.
Handles render_slide, generate_mermaid_flow, find_dependencies, show_modal.
"""

import asyncio
import json
import os
from typing import Any, Dict, Optional
from fastapi import WebSocket
from loguru import logger

# Lazy-initialize Spanner client so server starts even without GCP auth locally
_spanner: Optional[object] = None

def _get_spanner():
    global _spanner
    if _spanner is None:
        try:
            from .spanner_client import SpannerGraphClient
            _spanner = SpannerGraphClient()
        except Exception as e:
            logger.warning(f"Spanner unavailable (running without graph queries): {e}")
    return _spanner


async def handle_tool_call(
    tool_name: str,
    args: Dict[str, Any],
    session_id: str,
    websocket: WebSocket,
) -> Dict[str, Any]:
    """Dispatch to the appropriate tool handler and send UI update to browser."""

    if tool_name == "render_slide":
        slide_data = {
            "header": args.get("header", ""),
            "code": {
                "language": args.get("code_language", "python"),
                "content": args.get("code_content", ""),
                "file": args.get("code_file"),
                "lines": args.get("code_lines"),
            } if args.get("code_content") else None,
            "narrative_notes": args.get("narrative_notes"),
            "visual_type": "none",
        }
        await websocket.send_json({"type": "slide_update", "slide": slide_data})
        logger.debug(f"[{session_id}] render_slide: {args.get('header')}")
        return {"status": "slide_rendered", "header": args.get("header")}

    elif tool_name == "generate_mermaid_flow":
        slide_data = {
            "header": args.get("title", "Diagram"),
            "mermaid": args.get("mermaid_code", ""),
            "visual_type": args.get("diagram_type", "flowchart"),
        }
        await websocket.send_json({"type": "slide_update", "slide": slide_data})
        logger.debug(f"[{session_id}] generate_mermaid_flow: {args.get('title')}")
        return {"status": "mermaid_rendered", "title": args.get("title")}

    elif tool_name == "find_dependencies":
        entity_name = args.get("entity_name", "")
        relationship = args.get("relationship", "CALLS")
        depth = args.get("depth", 1)

        try:
            spanner = _get_spanner()
            if spanner is None:
                return {"status": "ok", "results": [], "count": 0, "note": "Spanner not configured"}
            results = await spanner.find_dependencies(
                session_id=session_id,
                entity_name=entity_name,
                relationship=relationship,
                depth=depth,
            )
            logger.debug(f"[{session_id}] find_dependencies({entity_name}): {len(results)} results")
            return {"status": "ok", "results": results, "count": len(results)}
        except Exception as e:
            logger.error(f"Spanner query error: {e}")
            return {"status": "error", "message": str(e), "results": []}

    elif tool_name == "show_modal":
        await websocket.send_json({
            "type": "show_modal",
            "title": args.get("title"),
            "content": args.get("content"),
            "visual_type": args.get("visual_type", "overview"),
        })
        return {"status": "modal_shown"}

    else:
        logger.warning(f"Unknown tool called: {tool_name}")
        return {"status": "error", "message": f"Unknown tool: {tool_name}"}
