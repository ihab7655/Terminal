#!/usr/bin/env bash
# The whole point of the change, in one session:
#
#   1. a short Arabic request for WORK — the case the word list called chat
#   2. a question about the workspace — the case that was answered from memory
#
# Before this, (1) was "conversation @0.95" with no model call at all, and (2)
# got "run `ls -la` yourself" with zero tool calls.
set -u
RAW=${RAW:-/tmp/oneruntime.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
( sleep 3;  printf ' '
  sleep 2;  printf 'اكتب ملف\r'
  sleep "${WORK:-95}"
  printf 'هل يوجد ملف اسمه تجربة في /home/spark؟\r'
  sleep "${WATCH:-70}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-220} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
