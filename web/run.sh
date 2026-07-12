#!/usr/bin/env bash
# Run the dev server with output going to both the terminal and web.log
# (the log file is truncated on each run). Extra args pass through, e.g.:
#   ./run.sh -p 3001
set -euo pipefail
cd "$(dirname "$0")"

LOG_FILE="web.log"
: > "$LOG_FILE"

npm run dev -- "$@" 2>&1 | tee "$LOG_FILE"
