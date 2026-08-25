#!/usr/bin/env bash
# The shape that exposed it: an empty workspace, one Python file, run it.
# Before the fix this cost three failed calls (bash python3 → run_artifact →
# bash python) before execute_code got there.
set -u
RAW=${RAW:-/tmp/onefile.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
( sleep 3; printf ' '
  sleep 2; printf 'اكتب ملف بايثون يطبع الارقام من واحد الى عشرة وشغله\r'
  sleep "${WATCH:-140}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-200} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
