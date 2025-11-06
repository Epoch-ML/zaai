#!/bin/bash
# Run behave tests and output results
# Usage: ./run_behave.sh

# Run behave (output will be captured by caller)
poetry run behave
exit $?

