#!/bin/bash
# Main test orchestrator - starts server, runs tests, stops server
# Usage: ./run_full_test.sh
# Output: Writes results to /tmp/djangogoat_test_output.txt

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="/tmp/djangogoat_test_output.txt"

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    bash "$SCRIPT_DIR/stop_server.sh"
}

# Set trap to ensure cleanup runs
trap cleanup EXIT INT TERM

# Start server
echo "Starting server..."
if ! bash "$SCRIPT_DIR/start_server.sh" 3572; then
    echo "✗ Failed to start server"
    exit 1
fi

echo ""

# Run behave tests and capture output
if bash "$SCRIPT_DIR/run_behave.sh" 2>&1 | tee "$OUTPUT_FILE"; then
    TEST_EXIT=0
else
    TEST_EXIT=$?
fi

echo ""
echo "Test output saved to: $OUTPUT_FILE"
echo "Test exit code: $TEST_EXIT"

exit $TEST_EXIT

