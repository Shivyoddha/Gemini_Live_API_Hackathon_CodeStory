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


def sanitize_filename(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "_", name)
    return name + ".md"


def split_markdown_into_sections(markdown_text: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    pattern = r"(?=^#\s.+$)"
    parts = re.split(pattern, markdown_text, flags=re.MULTILINE)

    for part in parts:
        if not part.strip():
            continue
        lines = part.strip().split("\n")
        title_line = lines[0]
        if title_line.startswith("# "):
            section_title = title_line.replace("# ", "").strip()
            sections[section_title] = part.strip()

    return sections


def create_zip_from_markdown(
    markdown_text: str,
    output_zip: str = "documentation_sections.zip",
) -> Path:
    temp_dir = Path("temp_md_sections")
    temp_dir.mkdir(exist_ok=True)

    sections = split_markdown_into_sections(markdown_text)

    for idx, (title, content) in enumerate(sections.items(), start=1):
        filename = f"{str(idx).zfill(2)}_{sanitize_filename(title)}"
        file_path = temp_dir / filename
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

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

    zip_path = create_zip_from_markdown(final_output, output_zip=output_zip)

    # Optionally write individual .md section files so server.py can read them
    if docs_dir is not None:
        docs_dir = Path(docs_dir)
        docs_dir.mkdir(parents=True, exist_ok=True)
        sections = split_markdown_into_sections(final_output)
        for idx, (title, content) in enumerate(sections.items(), start=1):
            filename = f"{str(idx).zfill(2)}_{sanitize_filename(title)}.md"
            (docs_dir / filename).write_text(content, encoding="utf-8")
        log("INFO", f"Documentation sections written to {docs_dir}")

    # Persist results into shared context
    ctx.doc_output = final_output
    ctx.doc_zip_path = zip_path

    log("INFO", "Documentation generation complete 📘")