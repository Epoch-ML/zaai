#!/bin/bash
# Start Django server for testing
# Usage: ./start_server.sh [port]

PORT=${1:-3572}

# Kill any existing server on the port
if command -v lsof &> /dev/null; then
    # macOS/Linux
    lsof -ti:$PORT | xargs -r kill -9 2>/dev/null || true
elif command -v netstat &> /dev/null; then
    # Windows
    for pid in $(netstat -ano | grep ":$PORT " | awk '{print $5}'); do
        taskkill //F //PID $pid 2>/dev/null || true
    done
fi

# Wait for port to be released
sleep 0.5

# Run migrations
echo "[start_server] Running migrations..."
poetry run python manage.py migrate --run-syncdb --noinput || exit 1

# Collect static files
echo "[start_server] Collecting static files..."
poetry run python manage.py collectstatic --noinput || exit 1

# Start server (background)
echo "[start_server] Launching Django server on 127.0.0.1:$PORT ..."
poetry run python manage.py runserver 127.0.0.1:$PORT --noreload &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..30}; do
    if nc -z 127.0.0.1 $PORT 2>/dev/null || curl -s http://127.0.0.1:$PORT >/dev/null 2>&1; then
        echo "[start_server] Server is up (pid $SERVER_PID)."
        echo $SERVER_PID > /tmp/djangogoat_server.pid
        exit 0
    fi
    sleep 0.5
done

# Server failed to start
echo "[start_server] ERROR: Server failed to start within expected time."
kill -9 $SERVER_PID 2>/dev/null || true
exit 1

