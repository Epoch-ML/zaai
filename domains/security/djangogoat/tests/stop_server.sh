#!/bin/bash
# Stop Django server
# Usage: ./stop_server.sh

if [ -f /tmp/djangogoat_server.pid ]; then
    SERVER_PID=$(cat /tmp/djangogoat_server.pid)
    kill -9 $SERVER_PID 2>/dev/null || true
    rm -f /tmp/djangogoat_server.pid
    echo "✓ Server stopped"
else
    # Fallback: kill by port
    lsof -ti:3572 | xargs -r kill -9 2>/dev/null || true
fi

