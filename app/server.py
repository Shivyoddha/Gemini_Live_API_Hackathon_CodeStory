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
# Cloud Run sets PORT; in container we use nginx on PORT and Python on internal ports
WS_PORT = int(os.environ.get("WS_PORT", "8080"))    # WebSocket proxy server
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8081"))  # HTTP content API server

# Paths relative to this file (app/server.py → workspace root)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.dirname(_SCRIPT_DIR)
DOCS_DIR = os.path.join(WORKSPACE_ROOT, "documentation")
SLIDES_DIR = os.path.join(WORKSPACE_ROOT, "slides")
PIPELINE_SCRIPT = os.path.join(WORKSPACE_ROOT, "pipeline", "main.py")

# SQLite job-tracking database (dev fallback when Firestore not configured)
DB_PATH = os.path.join(_SCRIPT_DIR, "jobs.db")

# GCS + Firestore (dev fallback when not set)
GCS_BUCKET = os.environ.get("GCS_BUCKET") or ""
_gcs_client = None
_fs_client = None
_gcs_fs_lock = threading.Lock()

# Per-session in-memory ChromaDB (no persistent chroma.db file)
_session_chroma = {}
_chroma_lock = threading.Lock()


# ---------------------------------------------------------------------------
# GCS helpers (lazy init, fallback when GCS_BUCKET not set)
# ---------------------------------------------------------------------------

def _get_gcs_client():
    global _gcs_client
    if not GCS_BUCKET:
        return None
    with _gcs_fs_lock:
        if _gcs_client is None:
            try:
                from google.cloud import storage
                _gcs_client = storage.Client()
            except Exception as e:
                print(f"[GCS] Could not initialise: {e}")
    return _gcs_client


def _get_fs_client():
    global _fs_client
    with _gcs_fs_lock:
        if _fs_client is None:
            try:
                from google.cloud import firestore
                _fs_client = firestore.Client()
            except Exception as e:
                print(f"[Firestore] Could not initialise: {e}")
    return _fs_client


# ---------------------------------------------------------------------------
# SQLite helpers (dev fallback)
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


def _upsert_job(job_id: str, url: str, status: str, message: str, session_id: str | None = None) -> None:
    """Write job state. Uses Firestore when configured and session_id present; else SQLite."""
    fs = _get_fs_client() if session_id else None
    if fs and session_id:
        try:
            doc_ref = fs.collection("sessions").document(session_id).collection("jobs").document(job_id)
            data = {"url": url, "status": status, "message": message}
            doc = doc_ref.get()
            if not doc.exists:
                data["created_at"] = time.time()
            doc_ref.set(data, merge=True)
            return
        except Exception as e:
            print(f"[Firestore] upsert error: {e}")
    # Fallback: SQLite (no session isolation in dev)
    with _get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO jobs (id, url, status, message, created_at) "
            "VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM jobs WHERE id=?), ?))",
            (job_id, url, status, message, job_id, time.time()),
        )


def _get_job(job_id: str, session_id: str | None = None) -> dict | None:
    """Read job state. Uses Firestore when configured and session_id present; else SQLite."""
    fs = _get_fs_client() if session_id else None
    if fs and session_id:
        try:
            doc = fs.collection("sessions").document(session_id).collection("jobs").document(job_id).get()
            if doc.exists:
                d = doc.to_dict()
                return {"id": job_id, "url": d.get("url", ""), "status": d.get("status", ""), "message": d.get("message", ""), "created_at": d.get("created_at")}
            return None
        except Exception as e:
            print(f"[Firestore] get error: {e}")
    with _get_db() as conn:
        row = conn.execute(
            "SELECT id, url, status, message, created_at FROM jobs WHERE id=?",
            (job_id,),
        ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "url": row[1], "status": row[2], "message": row[3], "created_at": row[4]}


# ---------------------------------------------------------------------------
# ChromaDB helpers (per-session in-memory EphemeralClient, no disk)
# ---------------------------------------------------------------------------

def _chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    """Split *text* into word-count chunks of *chunk_size*."""
    words = text.split()
    return [" ".join(words[i : i + chunk_size]) for i in range(0, len(words), chunk_size)]


def _get_session_chroma(session_id: str):
    """Return (and lazily create) the per-session ChromaDB collection (EphemeralClient)."""
    with _chroma_lock:
        if session_id not in _session_chroma:
            try:
                import chromadb
                client = chromadb.EphemeralClient()
                _session_chroma[session_id] = client.get_or_create_collection("documentation")
            except Exception as e:
                print(f"[ChromaDB] Could not initialise for session {session_id}: {e}")
                return None
    return _session_chroma.get(session_id)


def _index_content_into_session_chroma(session_id: str, content: dict) -> None:
    """Index docs and slides into the session's in-memory ChromaDB collection."""
    collection = _get_session_chroma(session_id)
    if collection is None:
        return
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
        print(f"[ChromaDB] Indexed {len(documents)} chunks for session {session_id}")


def search_docs(query: str, session_id: str | None, n_results: int = 3) -> list[dict]:
    """Return the top-*n_results* most relevant chunks for *query* from the session's ChromaDB."""
    if not session_id:
        return []
    collection = _get_session_chroma(session_id)
    if collection is None:
        return []
    try:
        count = collection.count()
        if count == 0:
            return []
        results = collection.query(query_texts=[query], n_results=min(n_results, count))
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

def _run_pipeline_background(job_id: str, repo_url: str, session_id: str) -> None:
    """Run the pipeline in a background thread. Writes to session-scoped dir, uploads to GCS when configured."""
    try:
        _upsert_job(job_id, repo_url, "cloning", "Cloning repository…", session_id)

        # Session-scoped output dir (local disk)
        import tempfile
        session_out = os.path.join(tempfile.gettempdir(), "sessions", session_id)
        os.makedirs(session_out, exist_ok=True)

        venv_python = os.path.join(WORKSPACE_ROOT, ".venv", "bin", "python")
        python_exe = venv_python if os.path.isfile(venv_python) else sys.executable

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        proc = subprocess.Popen(
            [python_exe, PIPELINE_SCRIPT, "--url", repo_url, "--choice", "3", "--output-dir", session_out],
            cwd=os.path.join(WORKSPACE_ROOT, "pipeline"),
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
            if "loning" in line:
                _upsert_job(job_id, repo_url, "cloning", line, session_id)
            elif "eading" in line or "blueprint" in line.lower():
                _upsert_job(job_id, repo_url, "running", line, session_id)
            elif "documentation" in line.lower() or "slide" in line.lower():
                _upsert_job(job_id, repo_url, "running", line, session_id)

        proc.wait()

        if proc.returncode == 0:
            _upsert_job(job_id, repo_url, "indexing", "Indexing content into ChromaDB…", session_id)
            # Upload to GCS if configured
            if GCS_BUCKET:
                try:
                    _upload_session_to_gcs(session_id, session_out)
                except Exception as e:
                    print(f"[GCS] Upload failed: {e}")
            threading.Thread(target=_index_then_done, args=(job_id, repo_url, session_id), daemon=True).start()
        else:
            _upsert_job(job_id, repo_url, "error", f"Pipeline exited with code {proc.returncode}", session_id)
    except Exception as e:
        _upsert_job(job_id, repo_url, "error", str(e), session_id)


def _upload_session_to_gcs(session_id: str, session_out: str) -> None:
    """Upload documentation/ and slides/ from session_out to GCS gs://{bucket}/{session_id}/."""
    client = _get_gcs_client()
    if not client:
        return
    bucket = client.bucket(GCS_BUCKET)
    docs_dir = os.path.join(session_out, "documentation")
    slides_dir = os.path.join(session_out, "slides")
    for base_dir, prefix in [(docs_dir, "documentation"), (slides_dir, "slides")]:
        if not os.path.isdir(base_dir):
            continue
        for root, _, files in os.walk(base_dir):
            for f in files:
                if not f.endswith(".md"):
                    continue
                path = os.path.join(root, f)
                rel = os.path.relpath(path, session_out)
                blob_name = f"{session_id}/{rel}"
                blob = bucket.blob(blob_name)
                with open(path, "rb") as src:
                    blob.upload_from_file(src, content_type="text/markdown")
    print(f"[GCS] Uploaded session {session_id} to gs://{GCS_BUCKET}/{session_id}/")


def _index_then_done(job_id: str, repo_url: str, session_id: str) -> None:
    try:
        index_content_into_chroma(session_id)
        _upsert_job(job_id, repo_url, "done", "Pipeline complete — content ready.", session_id)
    except Exception as e:
        _upsert_job(job_id, repo_url, "done", f"Pipeline complete (index warning: {e})", session_id)


def load_content(session_id: str | None = None):
    """Read docs and slides. When GCS_BUCKET set and session_id given, read from GCS. Else from local disk (dev)."""
    docs = []
    slides = []

    # GCS path: gs://{bucket}/{session_id}/documentation/ and /slides/
    gcs = _get_gcs_client()
    if GCS_BUCKET and session_id and gcs:
        try:
            bucket = gcs.bucket(GCS_BUCKET)
            # List and read documentation blobs
            for blob in bucket.list_blobs(prefix=f"{session_id}/documentation/"):
                if blob.name.endswith(".md"):
                    content = blob.download_as_text(encoding="utf-8")
                    basename = os.path.basename(blob.name)
                    module_key = os.path.splitext(basename)[0].lower().replace("_and_", "__")
                    docs.append({"filename": basename, "module": module_key, "text": content})
            # List and read slides (organized by module subdir: {session_id}/slides/{module}/file.md)
            for blob in bucket.list_blobs(prefix=f"{session_id}/slides/"):
                if blob.name.endswith(".md"):
                    content = blob.download_as_text(encoding="utf-8")
                    parts = blob.name.split("/")
                    if len(parts) >= 3:
                        module_dir = parts[-2]
                        basename = parts[-1]
                        slides.append({"module": module_dir, "filename": basename, "text": content})
            if docs or slides:
                project_name = _infer_project_name(docs, slides)
                return {"docs": docs, "slides": slides, "project_name": project_name}
        except Exception as e:
            print(f"[GCS] Error loading content for session {session_id}: {e}")

    # Fallback: local disk (dev mode)
    # Prefer session-scoped dir if it exists (/tmp/sessions/{session_id}/)
    import tempfile
    session_out = os.path.join(tempfile.gettempdir(), "sessions", (session_id or ""))
    if session_id and os.path.isdir(session_out):
        dev_docs_dir = os.path.join(session_out, "documentation")
        dev_slides_dir = os.path.join(session_out, "slides")
    else:
        dev_docs_dir = DOCS_DIR
        dev_slides_dir = SLIDES_DIR

    doc_pattern = os.path.join(dev_docs_dir, "*.md")
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
    if os.path.isdir(dev_slides_dir):
        for module_dir in sorted(os.listdir(dev_slides_dir)):
            module_path = os.path.join(dev_slides_dir, module_dir)
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
            session_id = (qs.get("session_id") or [""])[0].strip() or "dev"
            self._handle_content(session_id)
        elif path.startswith("/pipeline-status/"):
            job_id = path[len("/pipeline-status/"):].rstrip("/")
            session_id = (qs.get("session_id") or [""])[0].strip() or "dev"
            self._handle_pipeline_status(job_id, session_id)
        elif path == "/search-docs":
            query = qs.get("q", [""])[0].strip()
            session_id = (qs.get("session_id") or [""])[0].strip() or "dev"
            self._handle_search_docs(query, session_id)
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

    def _handle_content(self, session_id: str):
        try:
            content = load_content(session_id)
            self._send_json(200, content)
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_run_pipeline(self, data: dict):
        repo_url = (data.get("url") or "").strip()
        if not repo_url:
            self._send_json(400, {"error": "url is required"})
            return

        session_id = (data.get("session_id") or "").strip() or "dev"

        job_id = str(uuid.uuid4())
        _upsert_job(job_id, repo_url, "queued", "Pipeline queued…", session_id)

        t = threading.Thread(
            target=_run_pipeline_background,
            args=(job_id, repo_url, session_id),
            daemon=True,
        )
        t.start()

        self._send_json(200, {"jobId": job_id})

    def _handle_pipeline_status(self, job_id: str, session_id: str):
        job = _get_job(job_id, session_id)
        if job is None:
            self._send_json(404, {"error": "Job not found"})
            return
        self._send_json(200, {"status": job["status"], "message": job["message"]})

    def _handle_search_docs(self, query: str, session_id: str):
        if not query:
            self._send_json(400, {"error": "q parameter is required"})
            return
        chunks = search_docs(query, session_id)
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

    # Per-session ChromaDB is indexed on first search for each session (no startup auto-index)
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