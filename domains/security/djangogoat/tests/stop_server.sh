#!/bin/bash
# Stop Django server (silent mode)
# Usage: ./stop_server.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/djangogoat_stop_server.log"

: > "$LOG_FILE"

if [ -f /tmp/djangogoat_server.pid ]; then
    SERVER_PID=$(cat /tmp/djangogoat_server.pid)
    kill -9 $SERVER_PID >>"$LOG_FILE" 2>&1 || true
    rm -f /tmp/djangogoat_server.pid >>"$LOG_FILE" 2>&1
else
    # Fallback: kill by port
    lsof -ti:3572 | xargs -r kill -9 >>"$LOG_FILE" 2>&1 || true
fi

