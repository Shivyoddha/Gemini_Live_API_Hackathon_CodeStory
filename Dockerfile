# CodeStory backend for Google Cloud Run
# Serves WebSocket proxy + HTTP Content API + pipeline launcher (ADK agents)
FROM python:3.11-slim

# Nginx for single-port routing (Cloud Run exposes one PORT)
RUN apt-get update && apt-get install -y --no-install-recommends nginx git \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ─────────────────────────────────────────────────────────────
# Copy to /tmp so pip can read them before the real app dirs are created
COPY app/requirements.txt      /tmp/app_requirements.txt
COPY pipeline/requirements.txt /tmp/pipeline_requirements.txt
RUN pip install --no-cache-dir -r /tmp/app_requirements.txt \
 && pip install --no-cache-dir -r /tmp/pipeline_requirements.txt

# ── Backend ─────────────────────────────────────────────────────────────────
# Absolute destinations — no WORKDIR ambiguity for Cloud Build cache
COPY app/server.py  /app/app/server.py
COPY app/start.sh   /app/app/start.sh
# Strip Windows CRLF line endings from the shell script (safe no-op on LF files)
RUN sed -i 's/\r//' /app/app/start.sh && chmod +x /app/app/start.sh

# ── Pipeline agents ─────────────────────────────────────────────────────────
COPY pipeline/ /app/pipeline/

# ── Ephemeral output dirs ───────────────────────────────────────────────────
RUN mkdir -p /app/documentation /app/slides

# Cloud Run sets PORT; nginx listens on PORT, Python on 8081/8082
ENV PORT=8080
ENV HTTP_PORT=8081
ENV WS_PORT=8082
ENV GCS_BUCKET=""

EXPOSE 8080

WORKDIR /app/app
CMD ["./start.sh"]
