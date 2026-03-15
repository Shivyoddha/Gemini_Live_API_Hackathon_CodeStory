"""
slide_workflow.py
-----------------
Agent 3 — Slide Workflow Generator.

Changes from original:
  • generate_slides_from_blueprint now accepts PipelineContext and reads
    ctx.repo_contents — repository is never re-read from disk here.
  • Uses run_agent_query_with_retry for resilience.
  • Adds build_slide_index() which produces a companion slide_index.json
    alongside the presentation ZIP.  This JSON manifest is the machine-readable
    contract consumed by the Multimodal Live API narrator layer:
      - Ordered list of sections and slides
      - Slide file paths (relative inside the ZIP)
  • All slide parsing helpers, ZIP structure, and agent instruction are
    byte-for-byte identical to the original.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import Dict, List

from google.adk.agents import Agent

from common import ensure_api_key, log, make_session_service, run_agent_query_with_retry


# ---------------------------------------------------------------------------
# Agent factory  (instruction unchanged from original)
# ---------------------------------------------------------------------------


def create_repo_slide_agent(slide_blueprint: List[Dict]) -> Agent:
    return Agent(
        name="repo_slide_generator",
        model="gemini-2.5-flash",
        description="Generates section-wise multi-slide presentation directly from repository evidence.",
        instruction=f"""
You are the Technical Presentation Architect.

You MUST analyze the repository directly.

======================================================
📘 INPUT: SLIDE BLUEPRINT
======================================================

The following structure defines the sections you are required to cover.
DO NOT return this JSON list. Use it ONLY to structure your Markdown slides.

{slide_blueprint}

======================================================
🚨 STRICT RULES (MANDATORY)
======================================================

1. Return ONLY Markdown.
2. DO NOT return JSON. DO NOT return a copy of the blueprint.
3. Use ONLY repository evidence:
   - Dependency files, Imports, Config files, Folder structure, Source code, Build scripts.
4. If something is not explicitly present:
   → DO NOT assume it.
   → DO NOT statistically infer it.
5. Every technical claim must be grounded in observable repository evidence.

======================================================
SLIDE CONTENT QUALITY REQUIREMENTS
======================================================

Each section MUST contain MULTIPLE slides.

Each slide must contain 4–7 substantive bullet points.
Each bullet point MUST:
• Explain the *what*, *why*, and *how* — not just name a concept.
• Provide specific technical details (exact file names, config keys, class names, etc.).
• Use bold lead terms followed by a clear, complete sentence.

======================================================
OUTPUT FORMAT (STRICT)
======================================================

# Slides

## <Section Title>

### Slide 1: <Subtopic Title>
- **Bold lead term**: Full explanatory sentence with specific technical details.
- **Bold lead term**: Full explanatory sentence with specific technical details.
...

### Slide 2: <Subtopic Title>
...

## <Next Section Title>

### Slide 1: <Subtopic Title>
...

======================================================
FINAL CHECK
======================================================

• Return ONLY Markdown.
• The "Slide N:" prefix in the H3 header is MANDATORY for every slide.
• Every claim must be grounded in repository evidence.
"""
    )


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------


async def run_repo_slide_agent_with_existing_repo(
    ctx,  # PipelineContext
) -> str:
    ensure_api_key()

    repo_slide_agent = create_repo_slide_agent(ctx.blueprint)

    session_service = make_session_service()
    session = await session_service.create_session(
        app_name=repo_slide_agent.name,
        user_id=ctx.user_id,
    )

    query = (
        "Analyze the repository strictly using anti-hallucination rules.\n\n"
        "==================== REPOSITORY START ====================\n"
        f"{ctx.repo_contents}\n"
        "==================== REPOSITORY END ====================\n"
    )

    log("INFO", "Running slide agent…")

    final_output = await run_agent_query_with_retry(
        repo_slide_agent,
        query,
        session,
        ctx.user_id,
        verbose=False,
    )

    log("INFO", "Slide generation done ✅")
    return final_output


# ---------------------------------------------------------------------------
# Parsing helpers  (unchanged from original)
# ---------------------------------------------------------------------------


def extract_slides_section(markdown_text: str) -> str:
    """Return only the '# Slides' portion of the agent output.

    Handles both H1 (# Slides) and H2 (## Slides) variations.
    """
    slides_match = re.search(r"#{1,2} Slides(.*)", markdown_text, re.DOTALL | re.IGNORECASE)
    return slides_match.group(1).strip() if slides_match else markdown_text.strip()


def split_sections(text: str) -> list[str]:
    return re.findall(r"(## .+?)(?=\n## |\Z)", text, re.DOTALL)


def split_slides_within_section(section_text: str) -> list[str]:
    return re.findall(r"(### Slide \d+: .+?)(?=\n### Slide|\Z)", section_text, re.DOTALL)


def _normalize_section_title(title: str) -> str:
    """Same normalization as safe_section_name: for matching slide title to section title."""
    return re.sub(r"[^\w\s-]", "", title.strip()).replace(" ", "_").lower()


def _slide_has_minimum_content(
    slide_block: str,
    min_bullets: int = 2,
    min_body_words: int = 15,
) -> bool:
    """Return True if the slide has enough body content (bullets or word count)."""
    lines = slide_block.strip().split("\n")
    if not lines:
        return False
    body_lines = lines[1:]
    body_text = "\n".join(body_lines).strip()
    bullet_count = sum(
        1 for line in body_lines if line.strip().startswith(("- ", "* "))
    )
    word_count = len(body_text.split())
    return bullet_count >= min_bullets or (bullet_count >= 1 and word_count >= min_body_words)


def _is_redundant_section_title_slide(
    slide_title: str,
    section_title: str,
    slide_block: str,
) -> bool:
    """True if this slide is just the section title repeated with minimal/empty content."""
    if _normalize_section_title(slide_title) != _normalize_section_title(section_title):
        return False
    return not _slide_has_minimum_content(slide_block, min_bullets=2, min_body_words=20)


# ---------------------------------------------------------------------------
# ZIP creation + slide_index.json
# ---------------------------------------------------------------------------


def create_presentation_zip(
    markdown_text: str,
    output_zip: str = "repository_presentation.zip",
    base_dir: Path | None = None,
) -> Path:
    """Write per-slide .md files into a ZIP.

    *base_dir* overrides the default ``presentation_output`` directory so the
    caller can write directly to the workspace-root ``slides/`` folder that
    server.py expects.  Returns the path to the created ZIP file.
    """
    slides_text = extract_slides_section(markdown_text)

    slide_sections = split_sections(slides_text)

    if base_dir is None:
        base_dir = Path("presentation_output")
    base_dir.mkdir(parents=True, exist_ok=True)

    for section in slide_sections:
        section_title_match = re.search(r"## (.+)", section)
        if not section_title_match:
            continue

        section_title = section_title_match.group(1).strip()
        safe_section_name = re.sub(r"[^\w\s-]", "", section_title).replace(" ", "_").lower()

        slide_blocks = split_slides_within_section(section)
        kept_blocks: list[tuple[str, str]] = []
        for slide_block in slide_blocks:
            slide_match = re.search(r"### Slide (\d+): (.+)", slide_block)
            if not slide_match:
                continue
            if not _slide_has_minimum_content(slide_block):
                continue
            slide_title = slide_match.group(2).strip()
            if _is_redundant_section_title_slide(slide_title, section_title, slide_block):
                continue
            kept_blocks.append((slide_block, slide_title))

        if not kept_blocks:
            continue

        section_dir = base_dir / safe_section_name
        section_dir.mkdir(parents=True, exist_ok=True)

        for new_index, (slide_block, slide_title) in enumerate(kept_blocks, start=1):
            safe_slide_name = re.sub(r"[^\w\s-]", "", slide_title).replace(" ", "_").lower()
            filename = f"{str(new_index).zfill(3)}_{safe_slide_name}.md"
            with open(section_dir / filename, "w", encoding="utf-8") as f:
                f.write(slide_block.strip())

    zip_path = Path(output_zip)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in base_dir.rglob("*"):
            if file.is_file():
                zipf.write(file, arcname=file.relative_to(base_dir))

    log("INFO", f"Presentation ZIP created: {zip_path}")
    return zip_path


def build_slide_index(
    markdown_text: str,
    base_dir: Path,
    index_path: Path,
) -> Path:
    """Build a machine-readable JSON index of the presentation.

    This is the primary artefact consumed by the Multimodal Live API narrator:
    it knows exactly which file to read for each slide and the ordered
    section/slide structure needed to resume playback after a voice or text interruption.

    Parameters
    ----------
    markdown_text:
        Raw markdown output from the slide agent.
    base_dir:
        Root of the unpacked presentation_output directory (used to compute
        relative file paths stored in the index).
    index_path:
        Where to write the JSON file.

    Returns
    -------
    Path to the written index file.
    """
    slides_text = extract_slides_section(markdown_text)

    slide_sections = split_sections(slides_text)

    sections_index: list[dict] = []

    for section in slide_sections:
        section_title_match = re.search(r"## (.+)", section)
        if not section_title_match:
            continue

        section_title = section_title_match.group(1).strip()
        safe_section_name = re.sub(r"[^\w\s-]", "", section_title).replace(" ", "_").lower()

        slide_blocks = split_slides_within_section(section)
        kept_blocks: list[str] = []
        for slide_block in slide_blocks:
            if not _slide_has_minimum_content(slide_block):
                continue
            slide_match = re.search(r"### Slide \d+: (.+)", slide_block)
            if not slide_match:
                continue
            slide_title = slide_match.group(1).strip()
            if _is_redundant_section_title_slide(slide_title, section_title, slide_block):
                continue
            kept_blocks.append(slide_block)

        if not kept_blocks:
            continue

        slides_list = []
        for new_index, slide_block in enumerate(kept_blocks, start=1):
            slide_match = re.search(r"### Slide \d+: (.+)", slide_block)
            if not slide_match:
                continue
            slide_title = slide_match.group(1).strip()
            safe_slide_name = re.sub(r"[^\w\s-]", "", slide_title).replace(" ", "_").lower()
            filename = f"{str(new_index).zfill(3)}_{safe_slide_name}.md"
            slides_list.append(
                {
                    "slide_number": new_index,
                    "title": slide_title,
                    "file": f"{safe_section_name}/{filename}",
                }
            )

        sections_index.append(
            {
                "section": section_title,
                "slides": slides_list,
            }
        )

    index_data = {"sections": sections_index}

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)

    log("INFO", f"Slide index written: {index_path}")
    return index_path


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def generate_slides_from_blueprint(
    ctx,  # PipelineContext
    output_zip: str = "repository_presentation.zip",
    slides_dir: Path | None = None,
) -> None:
    """Generate slide content using the blueprint and repo contents in *ctx*.

    *slides_dir* overrides the default ``presentation_output`` directory so
    slides are written directly to the workspace-root ``slides/`` folder that
    server.py reads.  Stores results back into ctx.slide_output,
    ctx.slide_zip_path, and ctx.slide_index_path.
    """
    slide_output = await run_repo_slide_agent_with_existing_repo(ctx)

    base_dir = Path(slides_dir) if slides_dir is not None else Path("presentation_output")
    zip_path = create_presentation_zip(slide_output, output_zip=output_zip, base_dir=base_dir)

    # Build companion JSON index for the Multimodal Live API narrator
    index_path = Path(output_zip).with_name("slide_index.json")
    build_slide_index(slide_output, base_dir=base_dir, index_path=index_path)

    # Persist into shared context
    ctx.slide_output = slide_output
    ctx.slide_zip_path = zip_path
    ctx.slide_index_path = index_path

    log("INFO", "Slide workflow complete 🎯")