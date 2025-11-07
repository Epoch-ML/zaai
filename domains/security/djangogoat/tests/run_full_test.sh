#!/bin/bash
# Main test orchestrator - starts server, runs tests, stops server
# Usage: ./run_full_test.sh
# Output: Logs to tests/djangogoat_full_test.log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FULL_LOG="$SCRIPT_DIR/djangogoat_full_test.log"

# Truncate full log at start
: > "$FULL_LOG"

# Cleanup function
cleanup() {
    bash "$SCRIPT_DIR/stop_server.sh" >>"$FULL_LOG" 2>&1
}

# Set trap to ensure cleanup runs
trap cleanup EXIT INT TERM

# Start server - completely silent
bash "$SCRIPT_DIR/start_server.sh" 3572 >>"$FULL_LOG" 2>&1 || exit 1

# Run behave tests (logged)
bash "$SCRIPT_DIR/run_behave.sh" >>"$FULL_LOG" 2>&1

# Return behave exit code
exit $?

