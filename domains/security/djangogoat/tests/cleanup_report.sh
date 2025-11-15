#!/bin/bash
# Cleanup ZAP report.html file
# Usage: ./cleanup_report.sh <djangogoat_path>

DJANGOGOAT_PATH="$1"

if [ -z "$DJANGOGOAT_PATH" ]; then
    echo "[cleanup_report] Error: DjangoGoat path not provided" >&2
    exit 1
fi

REPORT_FILE="$DJANGOGOAT_PATH/report.html"

if [ -f "$REPORT_FILE" ]; then
    rm -f "$REPORT_FILE"
    echo "[cleanup_report] Deleted report.html"
else
    echo "[cleanup_report] report.html not found, nothing to clean up"
fi

exit 0

