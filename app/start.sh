#!/bin/bash
# For Cloud Run: single PORT exposed; nginx proxies to Python HTTP and WebSocket servers.
set -e
export PORT=${PORT:-8080}
export HTTP_PORT=${HTTP_PORT:-8081}
export WS_PORT=${WS_PORT:-8082}

cat > /tmp/nginx.conf << NGINX_EOF
daemon off;
events { worker_connections 1024; }
http {
  server {
    listen 0.0.0.0:${PORT};
    location /health {
      default_type text/plain;
      return 200 'ok';
    }
    location /ws {
      proxy_pass http://127.0.0.1:${WS_PORT};
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "Upgrade";
      proxy_set_header Host \$host;
    }
    location / {
      proxy_pass http://127.0.0.1:${HTTP_PORT};
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
    }
  }
}
NGINX_EOF

# Run Python server (HTTP on HTTP_PORT, WebSocket on WS_PORT) in background
python server.py &
# Give Python time to bind to HTTP_PORT/WS_PORT before nginx proxies
sleep 3
# Nginx listens on PORT (Cloud Run); use full path for reliability
exec /usr/sbin/nginx -c /tmp/nginx.conf
