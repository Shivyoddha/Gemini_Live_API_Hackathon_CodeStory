"""
codebase_doc_agent.py
---------------------
Agent 2 — Codebase Documentation Generator.

Changes from original:
  • generate_docs_from_blueprint now accepts PipelineContext and reads
    ctx.repo_contents — the repository is never re-read from disk here.
  • Uses run_agent_query_with_retry so transient API errors are handled.
  • Markdown output is stored in ctx.doc_output and ctx.doc_zip_path.
  • Agent instruction, ZIP structure, and section-splitting logic are unchanged.
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


def create_codebase_doc_agent(blueprint_output: List[Dict]) -> Agent:
    """Create the Intelligent Codebase Documentation Architect agent."""

    return Agent(
        name="codebase_doc_agent",
        model="gemini-2.5-flash",
        description=(
            "Agent specialized in analyzing a single GitHub repository or uploaded "
            "codebase zip and generating dynamic, evidence-based technical documentation "
            "with UML diagrams in Mermaid syntax."
        ),
        instruction=f"""
You are the "Codebase Documentation Architect" 🧠📘.

You MUST follow the structural and documentation blueprint provided below.

The Blueprint defines:
• Section names
• Section ordering
• Section balancing
• Inclusion/exclusion rules
• Formatting standards

You are NOT allowed to introduce new structural sections outside of the Blueprint.

Your responsibility is to populate those Blueprint-defined sections with
deep, precise, repository-grounded technical documentation.

====================================================================
📘 GOVERNING DOCUMENTATION BLUEPRINT
====================================================================

{blueprint_output}

====================================================================
📘 HOW TO USE THE BLUEPRINT
====================================================================

The Blueprint contains structured section definitions.
Each section includes:
• A title
• A description of what that section must cover

You must:

1. Use each Blueprint section title exactly as provided.
2. Use the section description as the authoritative scope definition.
3. Generate detailed, repository-grounded technical content that fulfills that description.
4. Expand deeply where the repository provides sufficient evidence.
5. Use structured tables, diagrams, and subheadings inside sections when appropriate.
6. Do NOT add, rename, or remove sections unless explicitly allowed by the Blueprint.
7. Do NOT generate placeholder or generic filler text.
8. Use a level-2 heading (##) for each Blueprint section title so each section can be extracted into a separate file. Include every Blueprint section.
9. Section titles must match the Blueprint exactly (character-for-character) so they can be extracted and matched to slide modules.

====================================================================
🎯 INPUT
====================================================================

The user will provide ONE of the following:
1) A single GitHub repository URL
OR
2) A single uploaded local zip file

You must analyze the actual contents of the repository before generating documentation.

====================================================================
📚 DEPTH & COMPLETENESS REQUIREMENT
====================================================================

This documentation must be comprehensive and onboarding-ready.

It should contain everything a new developer, architect, or technical reviewer
would need to understand:

• What the system does
• How it is structured
• How components interact
• How it runs
• What technologies are used and why
• How data flows
• How the application is configured
• How to build and execute it

Where appropriate:
• Use structured tables for clarity (e.g., libraries, modules, configuration, endpoints)
• Use bullet breakdowns for responsibilities
• Clearly explain interactions between modules
• Include configuration mapping details
• Explain control flow where visible
• Explain build/runtime execution paths if present

Depth must always remain grounded in repository evidence.

Avoid superficial summaries.
Prefer technical precision over marketing-style language.

====================================================================
🚨 ANTI-HALLUCINATION & EVIDENCE PROTOCOL (MANDATORY)
====================================================================

1. ONLY document technologies, frameworks, databases, tools, or patterns that are explicitly supported by:
   • Dependency files
   • Configuration files
   • Folder structure
   • Import statements
   • Source code usage
   • Build scripts
   • Container files
   • CI/CD configs

2. Every documented claim must be directly traceable to observable repository evidence.

3. If something is not clearly present in the codebase:
   → Do NOT assume it.
   → Do NOT infer it statistically.
   → Omit it entirely.

4. If a category is not detectable:
   → Do not fabricate it.
   → Omit it entirely.

5. If architecture cannot be confidently determined:
   → Explicitly state that it is inferred from observable structure.

6. If the Blueprint defines a section that is not supported by repository evidence:
   → Include the section only if Blueprint explicitly requires it.
   → Otherwise omit it entirely.
   → Never fabricate content to satisfy structure.

7. Do NOT rely on common stack defaults.
   Every claim must be grounded in visible repository evidence.

====================================================================
📊 UML DIAGRAM REQUIREMENTS
====================================================================

Generate diagrams ONLY if corresponding structures are present:

• Class Diagram → If object-oriented structures exist  
• Sequence Diagram → If request flow or runtime interaction is detectable  
• Component Diagram → If modular or layered structure exists  

All diagrams MUST:
• Use Mermaid syntax only
• Be syntactically valid
• Reflect actual repository structures
• Avoid fictional components

When rendering diagrams in Markdown, use fenced blocks labeled:

mermaid

====================================================================
🎯 FINAL INSTRUCTION
====================================================================

Return ONLY Markdown.

Follow the Blueprint structure exactly.
Use the Blueprint's section names and descriptions as the authoritative structure.
Populate each section with detailed, evidence-based content.

The response must begin directly with a Markdown heading.
Do not include prefaces, explanations, or meta commentary.
No hallucinated technologies.
Documentation must be commit-ready as README.md.
"""
    )


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------


def _section_id_from_title(title: str) -> str:
    """Same normalization as slide_workflow safe_section_name for doc–section linking."""
    return re.sub(r"[^\w\s-]", "", title.strip()).replace(" ", "_").lower()


def sanitize_filename(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "_", name)
    return name + ".md"


def split_markdown_into_sections(markdown_text: str) -> dict[str, str]:
    """Split markdown by top-level headings (H1 or H2). Each # or ## block becomes one section."""
    sections: dict[str, str] = {}
    pattern = r"(?=^#{1,2}\s.+)"
    parts = re.split(pattern, markdown_text, flags=re.MULTILINE)

    for part in parts:
        if not part.strip():
            continue
        lines = part.strip().split("\n")
        title_line = lines[0]
        if title_line.startswith("## "):
            section_title = title_line.replace("## ", "", 1).strip()
        elif title_line.startswith("# "):
            section_title = title_line.replace("# ", "", 1).strip()
        else:
            continue
        sections[section_title] = part.strip()

    return sections


def _normalize_title_for_match(title: str) -> str:
    """Normalize a section title for fuzzy matching against blueprint."""
    return re.sub(r"[^\w\s-]", "", title.strip()).replace(" ", "_").lower()


def build_blueprint_driven_docs(
    markdown_text: str, blueprint: List[Dict]
) -> List[tuple[str, str, str]]:
    """Build (filename, section_id, content) for each blueprint section.
    Uses blueprint as source of truth; matches agent output by exact or normalized title.
    Missing sections get a placeholder."""
    sections = split_markdown_into_sections(markdown_text)
    # Map normalized title -> (original_title, content)
    by_normalized: dict[str, tuple[str, str]] = {
        _normalize_title_for_match(t): (t, c) for t, c in sections.items()
    }

    result: List[tuple[str, str, str]] = []
    placeholder = (
        "## Section under construction\n\n"
        "Insufficient repository evidence for this section. "
        "It will be populated when more code is available."
    )

    for idx, bp_section in enumerate(blueprint, start=1):
        title = (bp_section.get("title") or "").strip()
        if not title:
            continue
        section_id = _section_id_from_title(title)
        filename = f"{str(idx).zfill(2)}_{section_id}.md"

        # Match agent output: exact first, then normalized
        content = None
        if title in sections:
            content = sections[title]
        else:
            norm = _section_id_from_title(title)
            if norm in by_normalized:
                _, content = by_normalized[norm]

        if content is None:
            content = placeholder

        result.append((filename, section_id, content))

    return result


def create_zip_from_markdown(
    markdown_text: str,
    output_zip: str = "documentation_sections.zip",
    blueprint: List[Dict] | None = None,
) -> Path:
    temp_dir = Path("temp_md_sections")
    temp_dir.mkdir(exist_ok=True)

    if blueprint:
        docs_list = build_blueprint_driven_docs(markdown_text, blueprint)
        for filename, _section_id, content in docs_list:
            (temp_dir / filename).write_text(content, encoding="utf-8")
    else:
        sections = split_markdown_into_sections(markdown_text)
        for idx, (title, content) in enumerate(sections.items(), start=1):
            filename = f"{str(idx).zfill(2)}_{sanitize_filename(title)}"
            (temp_dir / filename).write_text(content, encoding="utf-8")

    zip_path = Path(output_zip)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in temp_dir.iterdir():
            zipf.write(file, arcname=file.name)

    for file in temp_dir.iterdir():
        file.unlink()
    temp_dir.rmdir()

    log("INFO", f"Documentation ZIP created: {zip_path}")
    return zip_path


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def generate_docs_from_blueprint(
    ctx,  # PipelineContext
    output_zip: str = "documentation_sections.zip",
    docs_dir: Path | None = None,
) -> None:
    """Generate documentation using the blueprint and repo contents in *ctx*.

    *docs_dir* — when supplied, individual section ``.md`` files are also
    written there so server.py's ``/content`` endpoint can read them directly
    (workspace-root ``documentation/`` folder).

    Results are stored back into ctx.doc_output and ctx.doc_zip_path.
    """
    ensure_api_key()

    codebase_doc_agent = create_codebase_doc_agent(ctx.blueprint)

    session_service = make_session_service()
    session = await session_service.create_session(
        app_name=codebase_doc_agent.name,
        user_id=ctx.user_id,
    )

    query = (
        "Analyze the following GitHub repository contents and generate "
        "production-ready technical documentation with Mermaid UML diagrams.\n\n"
        "==================== REPOSITORY START ====================\n"
        f"{ctx.repo_contents}\n"
        "==================== REPOSITORY END ====================\n"
    )

    log("INFO", "Running documentation agent…")

    final_output = await run_agent_query_with_retry(
        codebase_doc_agent,
        query,
        session,
        ctx.user_id,
        verbose=True,
    )

    zip_path = create_zip_from_markdown(
        final_output, output_zip=output_zip, blueprint=ctx.blueprint
    )

    # Optionally write individual .md section files so server.py can read them
    if docs_dir is not None:
        docs_dir = Path(docs_dir)
        docs_dir.mkdir(parents=True, exist_ok=True)
        docs_list = build_blueprint_driven_docs(final_output, ctx.blueprint)
        manifest_sections = []
        for filename, section_id, content in docs_list:
            (docs_dir / filename).write_text(content, encoding="utf-8")
            manifest_sections.append({"filename": filename, "section_id": section_id})
        (docs_dir / "documentation_manifest.json").write_text(
            json.dumps({"sections": manifest_sections}, indent=2),
            encoding="utf-8",
        )
        log("INFO", f"Documentation sections written to {docs_dir}")

    # Persist results into shared context
    ctx.doc_output = final_output
    ctx.doc_zip_path = zip_path

    log("INFO", "Documentation generation complete 📘")