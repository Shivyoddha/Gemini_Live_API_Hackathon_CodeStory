"""
repo_utils.py
-------------
Utilities for cloning and reading GitHub repositories.

Changes from original:
  • Binary extensions are skipped (images, fonts, compiled artifacts, lock files)
    to reduce context noise fed to the model.
  • A max_total_chars ceiling prevents very large repos from silently overflowing
    the model context window; a truncation notice is appended when triggered.
  • Returns a (text, stats) named-tuple so callers can log ingestion metadata.
  • clone_repository signature is unchanged.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import NamedTuple, Optional


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SKIP_DIRS: frozenset[str] = frozenset(
    {".git", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache"}
)

_SKIP_EXTENSIONS: frozenset[str] = frozenset(
    {
        # Images / media
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp", ".tiff",
        # Fonts
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        # Compiled / binary
        ".pyc", ".pyo", ".class", ".exe", ".dll", ".so", ".dylib", ".o", ".a",
        # Package manager lock files (often huge, low signal)
        ".lock",
        # Archives
        ".zip", ".tar", ".gz", ".bz2", ".7z",
        # Misc binary
        ".pdf", ".bin", ".dat",
    }
)

_DEFAULT_MAX_FILE_SIZE_KB: int = 200
_DEFAULT_MAX_TOTAL_CHARS: int = 400_000


class RepoReadStats(NamedTuple):
    files: int
    chars: int
    truncated: bool


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def clone_repository(repo_url: str) -> Path:
    """Clone *repo_url* into a unique temporary directory and return its path."""
    temp_dir = tempfile.mkdtemp(prefix="repo_clone_")
    clone_path = Path(temp_dir)

    print(f"Cloning into temporary directory: {clone_path}")

    result = subprocess.run(
        ["git", "clone", repo_url, str(clone_path)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Git clone failed:\n{result.stderr}")

    return clone_path


def read_repository_contents(
    repo_path: str | Path,
    max_file_size_kb: int = _DEFAULT_MAX_FILE_SIZE_KB,
    max_total_chars: int = _DEFAULT_MAX_TOTAL_CHARS,
    *,
    skip_dirs: Optional[list[str]] = None,
) -> tuple[str, RepoReadStats]:
    """Read all text-based files from a repository into a single string.

    Parameters
    ----------
    repo_path:
        Root of the cloned repository.
    max_file_size_kb:
        Per-file size ceiling; larger files are silently skipped.
    max_total_chars:
        Hard ceiling on the total character count of the returned string.
        When reached a truncation notice is appended and reading stops.
    skip_dirs:
        Additional directory names to skip (merged with built-in defaults).

    Returns
    -------
    (text, stats)
        text  — full repository text ready to be embedded in a model prompt.
        stats — RepoReadStats(files, chars, truncated)
    """
    effective_skip = _SKIP_DIRS.copy()
    if skip_dirs:
        effective_skip = effective_skip | frozenset(skip_dirs)

    repo_text_parts: list[str] = []
    total_chars = 0
    file_count = 0
    truncated = False

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in effective_skip]

        for file in sorted(files):  # sorted for deterministic ordering
            suffix = Path(file).suffix.lower()
            if suffix in _SKIP_EXTENSIONS:
                continue

            full_path = os.path.join(root, file)

            try:
                if os.path.getsize(full_path) > max_file_size_kb * 1024:
                    continue

                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

            except Exception:  # pragma: no cover - defensive
                continue

            relative_path = os.path.relpath(full_path, repo_path)
            entry = f"\n\n# FILE: {relative_path}\n{content}"

            if total_chars + len(entry) > max_total_chars:
                repo_text_parts.append(
                    "\n\n# [TRUNCATION NOTICE]\n"
                    "Repository contents were truncated to fit the model context window.\n"
                    "The sections above represent the highest-signal files.\n"
                )
                truncated = True
                break

            repo_text_parts.append(entry)
            total_chars += len(entry)
            file_count += 1

        if truncated:
            break

    repo_text = "".join(repo_text_parts)
    return repo_text, RepoReadStats(files=file_count, chars=total_chars, truncated=truncated)
