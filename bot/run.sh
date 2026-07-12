#!/usr/bin/env bash
# Run the bot locally with output going to both the terminal and bot.log
# (the log file is truncated on each run). Extra args pass through, e.g.:
#   ./run.sh --transport webrtc --port 7080
set -euo pipefail
cd "$(dirname "$0")"

LOG_FILE="bot.log"
: > "$LOG_FILE"

# Unbuffered so log lines appear in real time despite the pipe.
PYTHONUNBUFFERED=1 uv run bot.py "$@" 2>&1 | tee "$LOG_FILE"
