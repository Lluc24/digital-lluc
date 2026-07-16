#!/usr/bin/env bash
# Run bot/ and web/ together. Each keeps writing its own log file
# (bot/bot.log, web/web.log) via their own run.sh; here we just prefix
# terminal output with [bot]/[web] and make Ctrl-C stop both.
set -uo pipefail
set -m  # job control on: each backgrounded pipeline gets its own process
        # group, so we can kill the whole tree (run.sh -> uv/npm -> bot.py/
        # next dev), not just the direct child.
cd "$(dirname "$0")"

log() { echo "$(date '+%H:%M:%S') $1"; }

declare -A names
pids=()

start() {
    local name="$1" dir="$2"
    (cd "$dir" && ./run.sh 2>&1 | sed -u "s/^/[$name] /") &
    local pid="$!"
    pids+=("$pid")
    names["$pid"]="$name"
    log "🚀 started [$name] pid=$pid (process group $pid)"
}

cleanup() {
    trap - INT TERM EXIT
    log "🛑 shutting down, killing process groups: ${pids[*]}"
    for pid in "${pids[@]}"; do
        if kill -- "-$pid" 2>/dev/null; then
            log "🔪 killed [${names[$pid]}] pid=$pid and its children"
        fi
    done
    wait "${pids[@]}" 2>/dev/null
    log "🏁 all processes stopped"
    exit 0
}
trap cleanup INT TERM EXIT

start bot bot
start web web

# Report each child's exit as it happens; stop once both have exited
# (cleanup then has nothing left to kill).
remaining="${#pids[@]}"
while [ "$remaining" -gt 0 ]; do
    wait -n -p exited_pid "${pids[@]}"
    status=$?
    log "👋 [${names[$exited_pid]}] pid=$exited_pid exited (status=$status)"
    remaining=$((remaining - 1))
done
