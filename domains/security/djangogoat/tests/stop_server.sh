#!/bin/bash
# Stop Django server (silent mode)
# Usage: ./stop_server.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/djangogoat_stop_server.log"

: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

if [ -f /tmp/djangogoat_server.pid ]; then
    SERVER_PID=$(cat /tmp/djangogoat_server.pid)
    echo "[stop_server] Stopping server pid $SERVER_PID..."
    kill -9 $SERVER_PID || true
    rm -f /tmp/djangogoat_server.pid || true
else
    # Fallback: kill by port
    echo "[stop_server] No pid file found; attempting to free port 3572."
    if command -v lsof &> /dev/null; then
        lsof -ti:3572 | xargs -r kill -9 || true
    elif command -v netstat &> /dev/null; then
        for pid in $(netstat -ano | grep ":3572 " | awk '{print $5}'); do
            taskkill //F //PID $pid 2>/dev/null || true
        done
    fi
fi

echo "[stop_server] Done."

