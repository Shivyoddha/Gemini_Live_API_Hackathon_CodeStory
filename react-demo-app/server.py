#!/usr/bin/env python3
"""
WebSocket Proxy Server for Gemini Live API
Handles authentication and proxies WebSocket connections.

This server acts as a bridge between the browser client and Gemini API,
handling Google Cloud authentication automatically using default credentials.
"""

import asyncio
import websockets
import json
import ssl
import certifi
import os
import sys
import glob
import sqlite3
import subprocess
import threading
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from websockets.legacy.server import WebSocketServerProtocol
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.exceptions import ConnectionClosed

# Google auth imports
import google.auth
from google.auth.transport.requests import Request

DEBUG = False  # Set to True for verbose logging
WS_PORT = 8080    # Port for WebSocket proxy server
HTTP_PORT = 8081  # Port for HTTP content API server

# Paths relative to this file (react-demo-app/server.py → workspace root)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.dirname(_SCRIPT_DIR)
DOCS_DIR = os.path.join(WORKSPACE_ROOT, "documentation")
SLIDES_DIR = os.path.join(WORKSPACE_ROOT, "slides")
PIPELINE_SCRIPT = os.path.join(WORKSPACE_ROOT, "combined_workflow_sent", "main.py")

# SQLite job-tracking database
DB_PATH = os.path.join(_SCRIPT_DIR, "jobs.db")

# ChromaDB persistent store
CHROMA_PATH = os.path.join(_SCRIPT_DIR, "chroma.db")
_chroma_collection = None       # initialised lazily
_chroma_lock = threading.Lock() # guards one-time setup


# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------

def _get_db() -> sqlite3.Connection:
    """Open (or create) the jobs database and return a connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id          TEXT PRIMARY KEY,
            url         TEXT,
            status      TEXT,
            message     TEXT,
            created_at  REAL
        )
    """)
    conn.commit()
    return conn


def _upsert_job(job_id: str, url: str, status: str, message: str) -> None:
    with _get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO jobs (id, url, status, message, created_at) "
            "VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM jobs WHERE id=?), ?))",
            (job_id, url, status, message, job_id, time.time()),
        )


def _get_job(job_id: str) -> dict | None:
    with _get_db() as conn:
        row = conn.execute(
            "SELECT id, url, status, message, created_at FROM jobs WHERE id=?",
            (job_id,),
        ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "url": row[1], "status": row[2], "message": row[3], "created_at": row[4]}


# ---------------------------------------------------------------------------
# ChromaDB helpers
# ---------------------------------------------------------------------------

def _get_chroma_collection():
    """Return (and lazily create) the ChromaDB collection."""
    global _chroma_collection
    with _chroma_lock:
        if _chroma_collection is None:
            try:
                import chromadb
                client = chromadb.PersistentClient(path=CHROMA_PATH)
                _chroma_collection = client.get_or_create_collection("documentation")
            except Exception as e:
                print(f"[ChromaDB] Could not initialise: {e}")
                return None
    return _chroma_collection


def _chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    """Split *text* into word-count chunks of *chunk_size*."""
    words = text.split()
    return [" ".join(words[i : i + chunk_size]) for i in range(0, len(words), chunk_size)]


def index_content_into_chroma() -> None:
    """Index all docs and slides into ChromaDB (upsert — safe to call repeatedly)."""
    collection = _get_chroma_collection()
    if collection is None:
        return

    content = load_content()
    documents, metadatas, ids = [], [], []

    for doc in content.get("docs", []):
        for i, chunk in enumerate(_chunk_text(doc["text"])):
            doc_id = f"doc__{doc['filename']}__{i}"
            documents.append(chunk)
            metadatas.append({"source": doc["filename"], "type": "doc"})
            ids.append(doc_id)

    for slide in content.get("slides", []):
        doc_id = f"slide__{slide['module']}__{slide['filename']}"
        documents.append(slide["text"])
        metadatas.append({
            "source": f"{slide['module']}/{slide['filename']}",
            "type": "slide",
            "module": slide["module"],
        })
        ids.append(doc_id)

    if documents:
        collection.upsert(documents=documents, metadatas=metadatas, ids=ids)
        print(f"[ChromaDB] Indexed/refreshed {len(documents)} chunks.")


def search_docs(query: str, n_results: int = 3) -> list[dict]:
    """Return the top-*n_results* most relevant chunks for *query*."""
    collection = _get_chroma_collection()
    if collection is None:
        return []
    try:
        results = collection.query(query_texts=[query], n_results=min(n_results, collection.count() or 1))
        chunks = []
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            chunks.append({"text": doc, "source": meta.get("source", "")})
        return chunks
    except Exception as e:
        print(f"[ChromaDB] Search error: {e}")
        return []


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def _run_pipeline_background(job_id: str, repo_url: str) -> None:
    """Run the combined_workflow_sent pipeline in a background thread."""
    try:
        _upsert_job(job_id, repo_url, "cloning", "Cloning repository…")

        # Locate the venv Python so we inherit the same packages
        venv_python = os.path.join(WORKSPACE_ROOT, ".venv", "bin", "python")
        python_exe = venv_python if os.path.isfile(venv_python) else sys.executable

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        proc = subprocess.Popen(
            [python_exe, PIPELINE_SCRIPT, "--url", repo_url, "--choice", "3"],
            cwd=os.path.join(WORKSPACE_ROOT, "combined_workflow_sent"),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            print(f"[Pipeline] {line}")
            # Map log lines to friendlier status messages
            if "loning" in line:
                _upsert_job(job_id, repo_url, "cloning", line)
            elif "eading" in line or "blueprint" in line.lower():
                _upsert_job(job_id, repo_url, "running", line)
            elif "documentation" in line.lower() or "slide" in line.lower():
                _upsert_job(job_id, repo_url, "running", line)

        proc.wait()

        if proc.returncode == 0:
            _upsert_job(job_id, repo_url, "indexing", "Indexing content into ChromaDB…")
            # Re-index so search works immediately for the new repo
            threading.Thread(target=_index_then_done, args=(job_id, repo_url), daemon=True).start()
        else:
            _upsert_job(job_id, repo_url, "error", f"Pipeline exited with code {proc.returncode}")
    except Exception as e:
        _upsert_job(job_id, repo_url, "error", str(e))


def _index_then_done(job_id: str, repo_url: str) -> None:
    try:
        index_content_into_chroma()
        _upsert_job(job_id, repo_url, "done", "Pipeline complete — content ready.")
    except Exception as e:
        _upsert_job(job_id, repo_url, "done", f"Pipeline complete (index warning: {e})")


def load_content():
    """Read all docs and slides from disk (always fresh, no caching)."""
    docs = []
    slides = []

    # Load documentation markdown files
    doc_pattern = os.path.join(DOCS_DIR, "*.md")
    for path in sorted(glob.glob(doc_pattern)):
        try:
            with open(path, "r", encoding="utf-8") as f:
                basename = os.path.basename(path)
                # Derive module key from filename: lowercase without extension,
                # normalise "_and_" → "__" to match slide subdirectory naming.
                # e.g. "04_Data_Model_and_Relationships.md" → "04_data_model__relationships"
                module_key = os.path.splitext(basename)[0].lower().replace("_and_", "__")
                docs.append({
                    "filename": basename,
                    "module": module_key,
                    "text": f.read(),
                })
        except Exception as e:
            print(f"Warning: Could not read doc {path}: {e}")

    # Load slides markdown files grouped by subdirectory (module)
    for module_dir in sorted(os.listdir(SLIDES_DIR)):
        module_path = os.path.join(SLIDES_DIR, module_dir)
        if not os.path.isdir(module_path):
            continue
        slide_pattern = os.path.join(module_path, "*.md")
        for path in sorted(glob.glob(slide_pattern)):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    slides.append({
                        "module": module_dir,
                        "filename": os.path.basename(path),
                        "text": f.read(),
                    })
            except Exception as e:
                print(f"Warning: Could not read slide {path}: {e}")

    # Derive a project name from the first available content (first line of first doc/slide)
    project_name = _infer_project_name(docs, slides)

    return {"docs": docs, "slides": slides, "project_name": project_name}


def _infer_project_name(docs, slides):
    """
    Extract a project name from the content by searching for a quoted or bolded
    word/phrase near 'project', 'application', 'website', or 'platform'.
    Prioritises files that look like project overviews.
    Falls back to 'this project' if nothing is found.
    """
    import re

    # Keywords that indicate proximity to a project name
    context_pattern = re.compile(
        r'(?:project|application|website|platform|app)\s+(?:is\s+(?:called|named)\s+)?'
        r'["\']([A-Z][A-Za-z0-9 _\-]{1,40})["\']'
        r'|["\']([A-Z][A-Za-z0-9 _\-]{1,40})["\']\s+(?:project|application|website|platform|app)',
        re.IGNORECASE,
    )

    # Sort items so "project_overview" / "Project_Overview" files are checked first
    def priority(item):
        name = (item.get("filename") or item.get("module") or "").lower()
        return 0 if "project_overview" in name or "overview" in name else 1

    ordered = sorted(docs + slides, key=priority)

    for item in ordered:
        text = item.get("text", "")
        m = context_pattern.search(text[:2000])
        if m:
            # group(1) or group(2) depending on which branch matched
            name = (m.group(1) or m.group(2) or "").strip()
            if name and len(name.split()) <= 6:
                return name

    return "this project"


class ContentRequestHandler(BaseHTTPRequestHandler):
    """HTTP handler serving content, job tracking, and vector-search endpoints."""

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/content":
            self._handle_content()
        elif path.startswith("/pipeline-status/"):
            job_id = path[len("/pipeline-status/"):]
            self._handle_pipeline_status(job_id)
        elif path == "/search-docs":
            query = qs.get("q", [""])[0].strip()
            self._handle_search_docs(query)
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/run-pipeline":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(body)
            except Exception:
                self._send_json(400, {"error": "Invalid JSON"})
                return
            self._handle_run_pipeline(data)
        else:
            self._send_json(404, {"error": "Not found"})

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    def _handle_content(self):
        try:
            content = load_content()
            self._send_json(200, content)
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_run_pipeline(self, data: dict):
        repo_url = (data.get("url") or "").strip()
        if not repo_url:
            self._send_json(400, {"error": "url is required"})
            return

        job_id = str(uuid.uuid4())
        _upsert_job(job_id, repo_url, "queued", "Pipeline queued…")

        t = threading.Thread(
            target=_run_pipeline_background,
            args=(job_id, repo_url),
            daemon=True,
        )
        t.start()

        self._send_json(200, {"jobId": job_id})

    def _handle_pipeline_status(self, job_id: str):
        job = _get_job(job_id)
        if job is None:
            self._send_json(404, {"error": "Job not found"})
            return
        self._send_json(200, {"status": job["status"], "message": job["message"]})

    def _handle_search_docs(self, query: str):
        if not query:
            self._send_json(400, {"error": "q parameter is required"})
            return
        chunks = search_docs(query)
        self._send_json(200, {"chunks": chunks})

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        if DEBUG:
            print(f"[HTTP] {format % args}")


def start_http_server():
    """Start the HTTP content server in a background thread."""
    server = HTTPServer(("0.0.0.0", HTTP_PORT), ContentRequestHandler)
    print(f"Content API running on http://localhost:{HTTP_PORT}")

    # Auto-index on startup if content exists and ChromaDB is empty (dev mode convenience)
    def _auto_index():
        try:
            col = _get_chroma_collection()
            if col is not None and os.path.isdir(DOCS_DIR) and os.path.isdir(SLIDES_DIR):
                if col.count() == 0:
                    print("[ChromaDB] Auto-indexing existing content on startup…")
                    index_content_into_chroma()
                else:
                    print(f"[ChromaDB] {col.count()} chunks already indexed.")
        except Exception as e:
            print(f"[ChromaDB] Auto-index skipped: {e}")

    threading.Thread(target=_auto_index, daemon=True).start()
    server.serve_forever()


def generate_access_token():
    """Retrieves an access token using Google Cloud default credentials."""
    try:
        creds, _ = google.auth.default()
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Error generating access token: {e}")
        print("Make sure you're logged in with: gcloud auth application-default login")
        return None


async def proxy_task(
    source_websocket: WebSocketCommonProtocol,
    destination_websocket: WebSocketCommonProtocol,
    is_server: bool,
) -> None:
    """
    Forwards messages from source_websocket to destination_websocket.

    Args:
        source_websocket: The WebSocket connection to receive messages from.
        destination_websocket: The WebSocket connection to send messages to.
        is_server: True if source is server side, False otherwise.
    """
    try:
        async for message in source_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    print(f"Proxying from {'server' if is_server else 'client'}: {data}")
                await destination_websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error processing message: {e}")
    except ConnectionClosed as e:
        print(
            f"{'Server' if is_server else 'Client'} connection closed: {e.code} - {e.reason}"
        )
    except Exception as e:
        print(f"Unexpected error in proxy_task: {e}")
    finally:
        await destination_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str, service_url: str
) -> None:
    """
    Establishes a WebSocket connection to the Gemini server and creates bidirectional proxy.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
        service_url: The url of the service to connect to.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    # Create SSL context with certifi certificates
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    print(f"Connecting to Gemini API...")
    if DEBUG:
        print(f"Service URL: {service_url}")

    try:
        async with websockets.connect(
            service_url,
            additional_headers=headers,
            ssl=ssl_context
        ) as server_websocket:
            print("Connected to Gemini API")

            # Create bidirectional proxy tasks
            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket, is_server=False)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket, is_server=True)
            )

            # Wait for either task to complete
            done, pending = await asyncio.wait(
                [client_to_server_task, server_to_client_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            # Cancel the remaining task
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            # Close connections
            try:
                await server_websocket.close()
            except:
                pass

            try:
                await client_websocket.close()
            except:
                pass

    except ConnectionClosed as e:
        print(f"Server connection closed unexpectedly: {e.code} - {e.reason}")
        try:
            await client_websocket.close(code=e.code, reason=e.reason)
        except Exception:
            pass
    except Exception as e:
        print(f"Failed to connect to Gemini API: {e}")
        try:
            await client_websocket.close(code=1008, reason="Upstream connection failed")
        except Exception:
            pass


async def handle_websocket_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new WebSocket client connection.

    Expects first message with optional bearer_token and service_url.
    If no bearer_token provided, generates one using Google default credentials.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("New WebSocket client connection...")
    try:
        # Wait for the first message from the client
        service_setup_message = await asyncio.wait_for(
            client_websocket.recv(), timeout=10.0
        )
        service_setup_message_data = json.loads(service_setup_message)

        bearer_token = service_setup_message_data.get("bearer_token")
        service_url = service_setup_message_data.get("service_url")

        # If no bearer token provided, generate one using default credentials
        if not bearer_token:
            print("Generating access token using default credentials...")
            bearer_token = generate_access_token()
            if not bearer_token:
                print("Failed to generate access token")
                await client_websocket.close(
                    code=1008, reason="Authentication failed"
                )
                return
            print("Access token generated")

        if not service_url:
            print("Error: Service URL is missing")
            await client_websocket.close(
                code=1008, reason="Service URL is required"
            )
            return

        await create_proxy(client_websocket, bearer_token, service_url)

    except asyncio.TimeoutError:
        print("Timeout waiting for the first message from the client")
        await client_websocket.close(code=1008, reason="Timeout")
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in first message: {e}")
        await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"Error handling client: {e}")
        try:
            await client_websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass


async def start_websocket_server():
    """Start the WebSocket proxy server."""
    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT):
        print(f"WebSocket proxy running on ws://localhost:{WS_PORT}")
        # Run forever
        await asyncio.Future()


async def main():
    """
    Starts both the HTTP content server and the WebSocket proxy server.
    """
    print(f"""
+============================================================+
|     Gemini Live API Proxy Server                          |
+------------------------------------------------------------+
|                                                            |
|  WebSocket Proxy:  ws://localhost:{WS_PORT:<5}                  |
|  Content API:      GET  /content                           |
|  Run Pipeline:     POST /run-pipeline                      |
|  Pipeline Status:  GET  /pipeline-status/<id>              |
|  Search Docs:      GET  /search-docs?q=<query>             |
|  All HTTP on:      http://localhost:{HTTP_PORT:<5}                 |
|                                                            |
|  Authentication:                                           |
|  - Uses Google Cloud default credentials                   |
|  - Run: gcloud auth application-default login              |
|                                                            |
+============================================================+
""")

    # Start HTTP content server in a daemon thread (stops when main process exits)
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    await start_websocket_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServers stopped")