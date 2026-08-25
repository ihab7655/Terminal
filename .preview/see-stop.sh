#!/usr/bin/env bash
# Esc against the real engine: type a goal that needs more than one wave, let it
# get going, press Esc, and watch what the engine says about the ending.
#
# The goal is deliberately multi-step: a cancel is read at a wave boundary, so a
# one-wave plan has no boundary left to read it at (docs: host-cancellation-lld
# §2). This is the proof that the key does something, not that it does it fast.
set -u
RAW=${RAW:-/tmp/stop.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
ESC=$(printf '\033')
GOAL=${GOAL:-'build a small python package: a module with two functions, a test file for it, and a README'}
( sleep 3; printf ' '                       # skip the opening
  sleep 2; printf '%s\r' "$GOAL"
  sleep "${WORK:-70}"; printf '%s' "$ESC"   # let it get into the work, then stop it
  sleep "${WATCH:-60}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-180} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
