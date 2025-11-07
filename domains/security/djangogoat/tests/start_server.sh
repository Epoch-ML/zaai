#!/bin/bash
# Start Django server for testing (silent mode)
# Usage: ./start_server.sh [port]

PORT=${1:-3572}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/djangogoat_start_server.log"

# Truncate log at start
: > "$LOG_FILE"

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

# Run migrations (silent, logged)
poetry run python manage.py migrate --run-syncdb --noinput >>"$LOG_FILE" 2>&1 || exit 1

# Collect static files (silent, logged)
poetry run python manage.py collectstatic --noinput >>"$LOG_FILE" 2>&1 || exit 1

# Start server (silent, background)
poetry run python manage.py runserver 127.0.0.1:$PORT --noreload >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..30}; do
    if nc -z 127.0.0.1 $PORT 2>/dev/null || curl -s http://127.0.0.1:$PORT >/dev/null 2>&1; then
        echo $SERVER_PID > /tmp/djangogoat_server.pid
        exit 0
    fi
    sleep 0.5
done

# Server failed to start
kill -9 $SERVER_PID 2>/dev/null || true
exit 1

