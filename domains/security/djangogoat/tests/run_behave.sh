#!/bin/bash
# Run behave tests and output results
# Usage: ./run_behave.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/djangogoat_behave.log"

: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[run_behave] Running behave scenarios..."
poetry run behave
exit $?

