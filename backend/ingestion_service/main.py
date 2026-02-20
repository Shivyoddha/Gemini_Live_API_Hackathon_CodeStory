"""
CodeStory Ingestion Service

Handles repository cloning, AST parsing, embedding generation,
and Spanner Graph hydration.
"""

import asyncio
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Dict, Optional

import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger
from dotenv import load_dotenv

from parsers.ast_parser import ASTParser
from parsers.spanner_hydrator import SpannerHydrator
from parsers.embedder import VertexEmbedder

load_dotenv()

app = FastAPI(title="CodeStory Ingestion Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (use Redis in production)
jobs: Dict[str, dict] = {}


class IngestRequest(BaseModel):
    repo_url: str
    session_id: str


class IngestStatusResponse(BaseModel):
    session_id: str
    status: str  # queued | running | complete | error
    progress: float
    step: str
    error: Optional[str] = None


def update_job(session_id: str, status: str, progress: float, step: str, error: str = None):
    jobs[session_id] = {
        "status": status,
        "progress": progress,
        "step": step,
        "error": error,
    }
    logger.info(f"[{session_id}] {step} ({progress:.0f}%)")


async def run_ingestion(session_id: str, repo_url: str):
    """Full ingestion pipeline: clone → parse → embed → hydrate Spanner."""
    tmp_dir = None
    try:
        # Step 1: Clone repository
        update_job(session_id, "running", 5, "Cloning repository…")
        tmp_dir = tempfile.mkdtemp(prefix=f"codestory_{session_id}_")

        import git
        git.Repo.clone_from(repo_url, tmp_dir, depth=1)
        update_job(session_id, "running", 20, "Repository cloned successfully")

        # Step 2: AST parsing
        update_job(session_id, "running", 22, "Parsing AST (Tree-sitter)…")
        parser = ASTParser()
        code_nodes = parser.parse_repository(tmp_dir)
        update_job(session_id, "running", 50, f"Parsed {len(code_nodes)} code entities")

        # Step 3: Generate embeddings
        update_job(session_id, "running", 52, "Generating embeddings (Vertex AI)…")
        embedder = VertexEmbedder()
        code_nodes_with_embeddings = await embedder.embed_nodes(code_nodes)
        update_job(session_id, "running", 75, "Embeddings generated")

        # Step 4: Hydrate Spanner Graph
        update_job(session_id, "running", 77, "Hydrating Spanner Graph…")
        hydrator = SpannerHydrator(session_id=session_id)
        await hydrator.hydrate(code_nodes_with_embeddings)
        update_job(session_id, "running", 92, "Knowledge graph built")

        # Step 5: Map call graph
        update_job(session_id, "running", 94, "Mapping call graph edges…")
        await hydrator.build_edges(code_nodes_with_embeddings)
        update_job(session_id, "running", 98, "Preparing Reasoning Engine…")

        # Done
        update_job(session_id, "complete", 100, "Ingestion complete — ready to begin story!")

    except Exception as e:
        logger.error(f"Ingestion error for {session_id}: {e}")
        update_job(session_id, "error", 0, "Ingestion failed", error=str(e))
    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "codestory-ingestion"}


@app.post("/start")
async def start_ingestion(req: IngestRequest, background_tasks: BackgroundTasks):
    """Kick off async ingestion pipeline."""
    if req.session_id in jobs and jobs[req.session_id]["status"] in ("running", "complete"):
        return {"session_id": req.session_id, "message": "Job already running or complete"}

    update_job(req.session_id, "queued", 0, "Job queued")
    background_tasks.add_task(run_ingestion, req.session_id, req.repo_url)
    logger.info(f"Ingestion queued: {req.session_id} → {req.repo_url}")
    return {"session_id": req.session_id, "message": "Ingestion started"}


@app.get("/status/{session_id}", response_model=IngestStatusResponse)
async def get_status(session_id: str):
    """Poll ingestion status."""
    if session_id not in jobs:
        raise HTTPException(status_code=404, detail="Session not found")
    job = jobs[session_id]
    return IngestStatusResponse(
        session_id=session_id,
        status=job["status"],
        progress=job["progress"],
        step=job["step"],
        error=job.get("error"),
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True, log_level="info")
