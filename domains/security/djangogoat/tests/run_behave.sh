#!/bin/bash
# Run behave tests and output results
# Usage: ./run_behave.sh

set -e

echo "======================================================================"
echo "RUNNING BEHAVE TESTS"
echo "======================================================================"
echo ""

# Run behave and capture exit code
poetry run behave
BEHAVE_EXIT=$?

echo ""
echo "======================================================================"
echo "BEHAVE TESTS COMPLETED (exit code: $BEHAVE_EXIT)"
echo "======================================================================"

exit $BEHAVE_EXIT

