"""
pipeline_context.py
-------------------
Shared context object that flows through the entire documentation pipeline.

Having a single PipelineContext means:
  • The repository is cloned and read from disk exactly once.
  • Every agent receives the same repo_contents string without re-reading.
  • Output artefacts (markdown text, zip paths, slide index) accumulate here so
    the orchestrator and future Live API integration can inspect them without
    touching the filesystem again.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PipelineContext:
    """Shared, mutable context object for the three-agent pipeline."""

    # ------------------------------------------------------------------ inputs
    repo_url: str
    """Original GitHub URL supplied by the user."""

    repo_path: Path
    """Local path where the repository was cloned."""

    repo_contents: str
    """Full text of the repository (read once by repo_utils.read_repository_contents)."""

    repo_stats: dict[str, Any]
    """Metadata about the repo read: {'files': int, 'chars': int, 'truncated': bool}."""

    user_id: str
    """Stable user identifier threaded into every ADK session."""

    # ----------------------------------------------------------------- outputs
    blueprint: list[dict] = field(default_factory=list)
    """Structured blueprint produced by Agent 1 (list of {title, description})."""

    raw_blueprint_text: str = ""
    """Raw text returned by Agent 1, kept for debugging."""

    doc_output: str = ""
    """Full markdown string returned by Agent 2 (codebase documentation)."""

    doc_zip_path: Path | None = None
    """Path to the ZIP produced by Agent 2."""

    slide_output: str = ""
    """Full markdown string returned by Agent 3 (slides + speaker scripts)."""

    slide_zip_path: Path | None = None
    """Path to the ZIP produced by Agent 3."""

    slide_index_path: Path | None = None
    """Path to the machine-readable JSON index produced alongside the slide ZIP.
    This is the primary artefact consumed by the Multimodal Live API narrator."""

    # ---------------------------------------------------------- helper methods
    def summary(self) -> str:
        """Return a human-readable one-liner for logging."""
        sections = len(self.blueprint)
        return (
            f"repo={self.repo_url!r}  "
            f"sections={sections}  "
            f"doc={'✅' if self.doc_output else '—'}  "
            f"slides={'✅' if self.slide_output else '—'}  "
            f"index={'✅' if self.slide_index_path else '—'}"
        )
