#!/bin/bash
# Run behave tests and output results
# Usage: ./run_behave.sh

echo "[run_behave] Running behave scenarios..."
poetry run behave
exit $?

