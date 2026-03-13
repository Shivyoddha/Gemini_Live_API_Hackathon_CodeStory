"""
main.py
-------
Pipeline orchestrator for the three-agent documentation system.

Changes from original:
  • Builds a PipelineContext at startup so the repository is cloned and read
    from disk exactly once.  All agents receive ctx.repo_contents from that
    shared object.
  • Agents 2 and 3 run concurrently with asyncio.gather when the user
    selects choice "3" (Both) — no more sequential wait + 10 s sleep.
  • Progress is emitted via the log() helper for consistent output.
  • Prints a final summary including the slide_index.json path so the Live
    API narrator layer knows where to find its manifest.
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

from common import ensure_api_key, log
from pipeline_context import PipelineContext
from repo_utils import clone_repository, read_repository_contents
from blueprint_agent import (
    create_blueprint_generator_agent,
    generate_dynamic_blueprint_with_parse_retry,
)
from codebase_doc_agent import generate_docs_from_blueprint
from slide_workflow import generate_slides_from_blueprint


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

# Project root (parent of combined_workflow_sent); .env there is shared with web app.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_environment() -> None:
    # Load root .env first (merged with web), then local .env overrides.
    load_dotenv(_PROJECT_ROOT / ".env")
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not found in .env file.")
    log("INFO", "Environment loaded successfully.")


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


async def main() -> None:
    load_environment()
    ensure_api_key()

    # Accept CLI args so server.py can invoke us non-interactively.
    # Falls back to interactive prompts when args are not supplied.
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--url", default=None, help="GitHub repository URL")
    parser.add_argument("--choice", default=None, help="1=docs, 2=slides, 3=both")
    args, _ = parser.parse_known_args()

    repo_url = args.url or input("Enter GitHub Repository URL: ").strip()
    user_id = "local_user"

    if args.choice is None:
        print("\nChoose what to run:")
        print("1 → Codebase Documentation")
        print("2 → Slides + Speaker Scripts")
        print("3 → Both")
        choice = input("Enter choice (1/2/3): ").strip()
    else:
        choice = args.choice

    # Output directories: always write to workspace root so server.py can find them.
    slides_out_dir = _PROJECT_ROOT / "slides"
    docs_out_dir = _PROJECT_ROOT / "documentation"

    # ------------------------------------------------------------------
    # Step 1 — Clone repository
    # ------------------------------------------------------------------
    log("INFO", "Cloning repository…")
    repo_path = clone_repository(repo_url)

    # ------------------------------------------------------------------
    # Step 2 — Read repository contents ONCE
    # ------------------------------------------------------------------
    log("INFO", "Reading repository contents…")
    repo_contents, stats = read_repository_contents(repo_path)
    log(
        "INFO",
        f"Repository ingested: {stats.files} files, "
        f"{stats.chars:,} chars"
        + (" (truncated)" if stats.truncated else ""),
    )

    # ------------------------------------------------------------------
    # Step 3 — Build shared context
    # ------------------------------------------------------------------
    ctx = PipelineContext(
        repo_url=repo_url,
        repo_path=repo_path,
        repo_contents=repo_contents,
        repo_stats=stats._asdict(),
        user_id=user_id,
    )

    # ------------------------------------------------------------------
    # Step 4 — Generate blueprint (Agent 1)
    # ------------------------------------------------------------------
    blueprint_agent = create_blueprint_generator_agent()
    blueprint_list, raw_text = await generate_dynamic_blueprint_with_parse_retry(
        ctx, blueprint_agent
    )
    ctx.blueprint = blueprint_list
    ctx.raw_blueprint_text = raw_text

    print("\n===== GENERATED BLUEPRINT =====\n")
    print(raw_text)
    print("\n===============================\n")

    # ------------------------------------------------------------------
    # Step 5 — Documentation / Slides / Both
    # ------------------------------------------------------------------
    if choice == "1":
        await generate_docs_from_blueprint(ctx, docs_dir=docs_out_dir)

    elif choice == "2":
        await generate_slides_from_blueprint(ctx, slides_dir=slides_out_dir)

    elif choice == "3":
        # Run Agents 2 and 3 concurrently — no sleep needed
        log("INFO", "Running documentation and slide agents concurrently…")
        await asyncio.gather(
            generate_docs_from_blueprint(ctx, docs_dir=docs_out_dir),
            generate_slides_from_blueprint(ctx, slides_dir=slides_out_dir),
        )

    else:
        log("WARN", "Invalid choice — nothing generated.")
        return

    # ------------------------------------------------------------------
    # Step 6 — Final summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 55)
    print("  PIPELINE COMPLETE")
    print("=" * 55)
    print(ctx.summary())

    if ctx.doc_zip_path:
        print(f"  📘 Documentation ZIP : {ctx.doc_zip_path}")
    if ctx.slide_zip_path:
        print(f"  🎞️  Slides ZIP        : {ctx.slide_zip_path}")
    if ctx.slide_index_path:
        print(f"  🗂️  Slide Index JSON  : {ctx.slide_index_path}")
        print("       (ready for Multimodal Live API narrator)")
    print("=" * 55 + "\n")


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    asyncio.run(main())