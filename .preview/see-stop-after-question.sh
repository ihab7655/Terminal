#!/usr/bin/env bash
# Esc on a goal that was resumed by answering the engine's question.
#
# This is the path the engine used to lose: a host that stopped a run resumed
# through answerClarification left the row saying `running`, announced nothing,
# and the console would have waited forever. Fixed in agent-engine@5378dc4 —
# this is what proves it from the outside.
set -u
RAW=${RAW:-/tmp/stop-after-q.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
ESC=$(printf '\033')
( sleep 3; printf ' '
  sleep 2; printf 'build a small python package with two functions and a test file\r'
  sleep "${ASK:-75}"; printf 'name it mathkit, one adds two numbers and one multiplies them\r'
  sleep "${WORK:-60}"; printf '%s' "$ESC"
  sleep "${WATCH:-50}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-260} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
