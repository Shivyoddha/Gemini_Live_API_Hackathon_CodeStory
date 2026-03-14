"""
run_walkthrough.py
-----------------
Non-interactive entrypoint for the web app (production).
Usage:
  python run_walkthrough.py <github_url> --docs     # generate documentation only
  python run_walkthrough.py <github_url> --slides   # generate slides + speaker scripts only

The web app replaces {githubUrl} with the URL the user pasted and runs these
commands from the project root. Do not paste a prompt here; paste the command.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from common import ensure_api_key, log
from main import load_environment
from pipeline_context import PipelineContext
from repo_utils import clone_repository, read_repository_contents
from blueprint_agent import (
    create_blueprint_generator_agent,
    generate_dynamic_blueprint_with_parse_retry,
)
from codebase_doc_agent import generate_docs_from_blueprint
from slide_workflow import generate_slides_from_blueprint


async def run(repo_url: str, *, docs: bool, slides: bool) -> None:
    load_environment()
    ensure_api_key()
    user_id = "web_user"

    log("INFO", f"Cloning repository: {repo_url}")
    repo_path = clone_repository(repo_url)
    log("INFO", "Reading repository contents…")
    repo_contents, stats = read_repository_contents(repo_path)
    log(
        "INFO",
        f"Repository ingested: {stats.files} files, {stats.chars:,} chars"
        + (" (truncated)" if stats.truncated else ""),
    )

    ctx = PipelineContext(
        repo_url=repo_url,
        repo_path=repo_path,
        repo_contents=repo_contents,
        repo_stats=stats._asdict(),
        user_id=user_id,
    )

    blueprint_agent = create_blueprint_generator_agent()
    blueprint_list, raw_text = await generate_dynamic_blueprint_with_parse_retry(
        ctx, blueprint_agent
    )
    ctx.blueprint = blueprint_list
    ctx.raw_blueprint_text = raw_text

    if docs:
        await generate_docs_from_blueprint(ctx)
    if slides:
        await generate_slides_from_blueprint(ctx)

    log("INFO", ctx.summary())


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate documentation and/or slides from a GitHub repo URL (non-interactive)."
    )
    parser.add_argument(
        "github_url",
        help="GitHub repository URL (e.g. https://github.com/owner/repo)",
    )
    parser.add_argument("--docs", action="store_true", help="Generate documentation only")
    parser.add_argument("--slides", action="store_true", help="Generate slides + speaker scripts only")
    args = parser.parse_args()

    if not args.docs and not args.slides:
        log("ERROR", "Specify at least one of --docs or --slides")
        sys.exit(1)

    asyncio.run(run(args.github_url, docs=args.docs, slides=args.slides))


if __name__ == "__main__":
    main()
