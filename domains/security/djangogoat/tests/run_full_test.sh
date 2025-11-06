#!/bin/bash
# Main test orchestrator - starts server, runs tests, stops server
# Usage: ./run_full_test.sh
# Output: Writes results to /tmp/djangogoat_test_output.txt
# Runs completely silently - all output redirected

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="/tmp/djangogoat_test_output.txt"

# Cleanup function
cleanup() {
    bash "$SCRIPT_DIR/stop_server.sh" &>/dev/null
}

# Set trap to ensure cleanup runs
trap cleanup EXIT INT TERM

# Start server - completely silent
bash "$SCRIPT_DIR/start_server.sh" 3572 &>/dev/null || exit 1

# Run behave tests - capture to file only (no console output)
bash "$SCRIPT_DIR/run_behave.sh" >"$OUTPUT_FILE" 2>&1

# Return behave exit code
exit $?

