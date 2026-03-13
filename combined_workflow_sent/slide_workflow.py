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
      - Speaker script file path per section
      - Word count of each speaker script (useful for narrator pacing)
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
        model="gemini-2.5-flash-lite",
        description="Generates section-wise multi-slide presentation directly from repository evidence.",
        instruction=f"""
You are the Technical Presentation Architect.

You MUST analyze the repository directly.

🚨 STRICT ANTI-HALLUCINATION RULES (MANDATORY)

1. Use ONLY repository evidence:
   - Dependency files
   - Imports
   - Config files
   - Folder structure
   - Source code
   - Build scripts
   - Container files

2. If something is not explicitly present:
   → DO NOT assume it.
   → DO NOT statistically infer it.
   → DO NOT fabricate architecture or tools.

3. If a section has insufficient evidence:
   → Omit that section entirely.

4. Every technical claim must be grounded in observable repository evidence.

======================================================
SLIDE STRUCTURE REQUIREMENTS
======================================================

Use this predefined structure:

{slide_blueprint}

IMPORTANT:

• Each section MUST contain MULTIPLE slides if content allows.
• No limit on total slides.
• Slides must be detailed and presentation-ready.
• Slides must not be overly short.
• Each slide should meaningfully cover a subtopic of that section.

======================================================
OUTPUT FORMAT (STRICT)
======================================================

# Slides

## <Section Title>

### Slide 1: <Subtopic>
- Detailed bullet points
- Technically grounded in repository evidence

### Slide 2: <Subtopic>
...

## <Next Section Title>

### Slide X: <Subtopic>
...

# Speaker Scripts

## <Section Title>

Slide 1:
Detailed explanation for Slide 1 of this section.

Slide 2:
Detailed explanation for Slide 2 of this section.

## <Next Section Title>

Slide X:
Explanation for Slide X of this section.

======================================================
SPEAKER SCRIPT RULES
======================================================

• Each section must have its own speaker script block.
• Script must reference slide numbers clearly
• 120–250 words per slide explanation.
• Must expand beyond bullet points.
• Must not hallucinate any technologies or architecture.
• Every claim must be grounded in repository evidence.

Return ONLY Markdown.
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


def extract_slides_and_scripts(markdown_text: str) -> tuple[str, str]:
    slides_match = re.search(r"# Slides(.*?)# Speaker Scripts", markdown_text, re.DOTALL)
    script_match = re.search(r"# Speaker Scripts(.*)", markdown_text, re.DOTALL)

    slides_text = slides_match.group(1).strip() if slides_match else ""
    script_text = script_match.group(1).strip() if script_match else ""

    return slides_text, script_text


def split_sections(text: str) -> list[str]:
    return re.findall(r"(## .+?)(?=\n## |\Z)", text, re.DOTALL)


def split_slides_within_section(section_text: str) -> list[str]:
    return re.findall(r"(### Slide \d+: .+?)(?=\n### Slide|\Z)", section_text, re.DOTALL)


def split_section_scripts(script_text: str) -> list[str]:
    return re.findall(r"(## .+?)(?=\n## |\Z)", script_text, re.DOTALL)


# ---------------------------------------------------------------------------
# ZIP creation + slide_index.json
# ---------------------------------------------------------------------------


def create_presentation_zip(
    markdown_text: str,
    output_zip: str = "repository_presentation.zip",
    base_dir: Path | None = None,
) -> Path:
    """Write per-slide .md files and per-section speaker_script.md into a ZIP.

    *base_dir* overrides the default ``presentation_output`` directory so the
    caller can write directly to the workspace-root ``slides/`` folder that
    server.py expects.  Returns the path to the created ZIP file.
    """
    slides_text, script_text = extract_slides_and_scripts(markdown_text)

    slide_sections = split_sections(slides_text)
    script_sections = split_section_scripts(script_text)

    if base_dir is None:
        base_dir = Path("presentation_output")
    base_dir.mkdir(parents=True, exist_ok=True)

    script_map: dict[str, str] = {}
    for script_section in script_sections:
        title_match = re.search(r"## (.+)", script_section)
        if title_match:
            script_map[title_match.group(1).strip()] = script_section.strip()

    for section in slide_sections:
        section_title_match = re.search(r"## (.+)", section)
        if not section_title_match:
            continue

        section_title = section_title_match.group(1).strip()
        safe_section_name = re.sub(r"[^\w\s-]", "", section_title).replace(" ", "_").lower()

        section_dir = base_dir / safe_section_name
        section_dir.mkdir(parents=True, exist_ok=True)

        slide_blocks = split_slides_within_section(section)

        for slide_block in slide_blocks:
            slide_match = re.search(r"### Slide (\d+): (.+)", slide_block)
            if not slide_match:
                continue

            slide_number = slide_match.group(1)
            slide_title = slide_match.group(2)

            safe_slide_name = re.sub(r"[^\w\s-]", "", slide_title).replace(" ", "_").lower()
            filename = f"{slide_number.zfill(3)}_{safe_slide_name}.md"

            with open(section_dir / filename, "w", encoding="utf-8") as f:
                f.write(slide_block.strip())

        if section_title in script_map:
            with open(section_dir / "speaker_script.md", "w", encoding="utf-8") as f:
                f.write(script_map[section_title])

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
    it knows exactly which file to read for each slide, how long each speaker
    script is (for pacing), and the ordered section/slide structure needed to
    resume playback after a voice or text interruption.

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
    slides_text, script_text = extract_slides_and_scripts(markdown_text)

    slide_sections = split_sections(slides_text)
    script_sections = split_section_scripts(script_text)

    # Build script map for word-count lookup
    script_map: dict[str, str] = {}
    for script_section in script_sections:
        title_match = re.search(r"## (.+)", script_section)
        if title_match:
            script_map[title_match.group(1).strip()] = script_section.strip()

    sections_index: list[dict] = []

    for section in slide_sections:
        section_title_match = re.search(r"## (.+)", section)
        if not section_title_match:
            continue

        section_title = section_title_match.group(1).strip()
        safe_section_name = re.sub(r"[^\w\s-]", "", section_title).replace(" ", "_").lower()

        slide_blocks = split_slides_within_section(section)

        slides_list: list[dict] = []
        for slide_block in slide_blocks:
            slide_match = re.search(r"### Slide (\d+): (.+)", slide_block)
            if not slide_match:
                continue

            slide_number = int(slide_match.group(1))
            slide_title = slide_match.group(2).strip()
            safe_slide_name = re.sub(r"[^\w\s-]", "", slide_title).replace(" ", "_").lower()
            filename = f"{str(slide_number).zfill(3)}_{safe_slide_name}.md"

            slides_list.append(
                {
                    "slide_number": slide_number,
                    "title": slide_title,
                    "file": f"{safe_section_name}/{filename}",
                }
            )

        script_content = script_map.get(section_title, "")
        word_count = len(script_content.split()) if script_content else 0
        script_file = f"{safe_section_name}/speaker_script.md" if script_content else None

        sections_index.append(
            {
                "section": section_title,
                "slides": slides_list,
                "speaker_script_file": script_file,
                "script_word_count": word_count,
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