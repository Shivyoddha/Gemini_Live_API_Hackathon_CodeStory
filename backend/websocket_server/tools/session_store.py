"""Simple in-memory + file-backed session token store for Gemini Live session resumption."""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional


class SessionStore:
    """Stores Gemini Live session resumption tokens (valid for 2 hours)."""

    def __init__(self, store_dir: str = "/tmp/codestory_sessions"):
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, str] = {}

    async def save_token(self, session_id: str, token: str) -> None:
        self._cache[session_id] = token
        path = self.store_dir / f"{session_id}.token"
        path.write_text(json.dumps({"session_id": session_id, "token": token}))

    async def get_token(self, session_id: str) -> Optional[str]:
        if session_id in self._cache:
            return self._cache[session_id]
        path = self.store_dir / f"{session_id}.token"
        if path.exists():
            data = json.loads(path.read_text())
            self._cache[session_id] = data["token"]
            return data["token"]
        return None

    async def delete_token(self, session_id: str) -> None:
        self._cache.pop(session_id, None)
        path = self.store_dir / f"{session_id}.token"
        path.unlink(missing_ok=True)
