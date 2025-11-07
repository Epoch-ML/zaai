#!/bin/bash
# Main test orchestrator - starts server, runs tests, stops server
# Usage: ./run_full_test.sh
# Output: Logs to tests/djangogoat_full_test.log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FULL_LOG="$SCRIPT_DIR/djangogoat_full_test.log"

# Truncate full log at start and mirror stdout/stderr
: > "$FULL_LOG"
exec > >(tee -a "$FULL_LOG") 2>&1

# Cleanup function
cleanup() {
    echo "[run_full_test] Cleaning up..."
    bash "$SCRIPT_DIR/stop_server.sh"
}

# Set trap to ensure cleanup runs
trap cleanup EXIT INT TERM

# Start server
echo "[run_full_test] Starting server..."
bash "$SCRIPT_DIR/start_server.sh" 3572 || exit 1

# Run behave tests
echo "[run_full_test] Executing behave suite..."
bash "$SCRIPT_DIR/run_behave.sh"

# Return behave exit code
STATUS=$?
echo "[run_full_test] Behave exit code: $STATUS"
exit $STATUS

