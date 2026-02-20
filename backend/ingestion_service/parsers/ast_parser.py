"""
AST Parser using Tree-sitter to extract code structure from repositories.
Produces CodeNode objects for each significant entity (file, class, method).
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from loguru import logger

try:
    import tree_sitter_python as tspython
    import tree_sitter_javascript as tsjavascript
    import tree_sitter_typescript as tstypescript
    from tree_sitter import Language, Parser
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False
    logger.warning("Tree-sitter language bindings not available; using basic parser.")


@dataclass
class CodeNode:
    """Represents a parseable code entity."""
    id: str  # uuid
    session_id: str
    node_type: str  # SourceFile | ClassObject | MethodObject | Documentation
    name: str
    path: str
    language: str
    content: str  # raw source
    doc_summary: str = ""
    embedding: Optional[List[float]] = None
    # Relationships
    parent_id: Optional[str] = None
    calls: List[str] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    extends: Optional[str] = None
    complexity: int = 0


LANGUAGE_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".rs": "rust",
    ".md": "markdown",
    ".json": "json",
}

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".next", "dist", "build",
    "venv", ".venv", "vendor", ".env", "coverage", ".pytest_cache",
}

MAX_FILE_SIZE_BYTES = 200_000  # ~200KB cap per file


class ASTParser:
    def __init__(self):
        self._parsers: dict = {}
        if TREE_SITTER_AVAILABLE:
            self._init_parsers()

    def _init_parsers(self):
        try:
            self._parsers["python"] = Parser(Language(tspython.language()))
            self._parsers["javascript"] = Parser(Language(tsjavascript.language()))
            self._parsers["typescript"] = Parser(Language(tstypescript.language_typescript()))
        except Exception as e:
            logger.warning(f"Could not init Tree-sitter parsers: {e}")

    def parse_repository(self, repo_path: str) -> List[CodeNode]:
        """Walk repo and extract code nodes for all supported files."""
        import uuid

        nodes: List[CodeNode] = []
        repo = Path(repo_path)

        for file_path in repo.rglob("*"):
            # Skip dirs, hidden, and blacklisted
            if file_path.is_dir():
                continue
            if any(part in SKIP_DIRS for part in file_path.parts):
                continue
            if file_path.stat().st_size > MAX_FILE_SIZE_BYTES:
                continue

            ext = file_path.suffix.lower()
            language = LANGUAGE_EXTENSIONS.get(ext)
            if not language:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                rel_path = str(file_path.relative_to(repo))

                file_id = str(uuid.uuid4())
                file_node = CodeNode(
                    id=file_id,
                    session_id="",
                    node_type="SourceFile",
                    name=file_path.name,
                    path=rel_path,
                    language=language,
                    content=content[:5000],  # first 5KB for context
                    doc_summary=self._extract_docstring(content, language),
                )
                nodes.append(file_node)

                # Deep parse Python/JS/TS with Tree-sitter
                if TREE_SITTER_AVAILABLE and language in self._parsers:
                    sub_nodes = self._parse_file_deep(
                        content, rel_path, language, file_id
                    )
                    nodes.extend(sub_nodes)

            except Exception as e:
                logger.debug(f"Skipping {file_path}: {e}")

        logger.info(f"AST parser: {len(nodes)} nodes extracted from {repo_path}")
        return nodes

    def _parse_file_deep(
        self, content: str, path: str, language: str, parent_id: str
    ) -> List[CodeNode]:
        """Use Tree-sitter to extract classes and methods from a source file."""
        import uuid
        nodes = []
        parser = self._parsers.get(language)
        if not parser:
            return nodes

        tree = parser.parse(bytes(content, "utf-8"))

        def visit(node, depth=0):
            if node.type in ("class_definition", "class_declaration"):
                name = self._get_child_text(node, "name", content)
                if name:
                    class_id = str(uuid.uuid4())
                    nodes.append(CodeNode(
                        id=class_id,
                        session_id="",
                        node_type="ClassObject",
                        name=name,
                        path=path,
                        language=language,
                        content=content[node.start_byte:node.end_byte][:2000],
                        parent_id=parent_id,
                        complexity=depth,
                    ))

            elif node.type in ("function_definition", "method_definition", "function_declaration"):
                name = self._get_child_text(node, "name", content)
                if name and not name.startswith("_test"):
                    nodes.append(CodeNode(
                        id=str(uuid.uuid4()),
                        session_id="",
                        node_type="MethodObject",
                        name=name,
                        path=path,
                        language=language,
                        content=content[node.start_byte:node.end_byte][:1500],
                        parent_id=parent_id,
                        complexity=depth,
                    ))

            for child in node.children:
                visit(child, depth + 1)

        visit(tree.root_node)
        return nodes

    def _get_child_text(self, node, field_name: str, source: str) -> Optional[str]:
        child = node.child_by_field_name(field_name)
        if child:
            return source[child.start_byte:child.end_byte].strip()
        return None

    def _extract_docstring(self, content: str, language: str) -> str:
        """Extract the first docstring/comment block as a summary."""
        lines = content.strip().splitlines()
        doc_lines = []
        in_docstring = False

        for line in lines[:30]:
            stripped = line.strip()
            if not in_docstring:
                if stripped.startswith('"""') or stripped.startswith("'''"):
                    in_docstring = True
                    doc_lines.append(stripped.lstrip('"\' '))
                elif stripped.startswith("#") or stripped.startswith("//"):
                    doc_lines.append(stripped.lstrip("#/ "))
                elif stripped and not stripped.startswith(("import", "from", "const", "let", "var")):
                    break
            else:
                if stripped.endswith('"""') or stripped.endswith("'''"):
                    doc_lines.append(stripped.rstrip('"\' '))
                    break
                doc_lines.append(stripped)

        return " ".join(doc_lines)[:500]
