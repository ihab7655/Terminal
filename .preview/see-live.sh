#!/usr/bin/env bash
# The console against the real engine: skip the opening, type a real goal, watch.
set -u
RAW=${RAW:-/tmp/live.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
( sleep 3; printf ' '
  sleep 2; printf 'write a python file hello.py that prints hello\r'
  sleep "${WATCH:-60}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout 90 npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
