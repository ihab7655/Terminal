#!/usr/bin/env bash
# The arrows, as a person uses them: say two things, then reach back for them.
# Also proves the draft survives browsing — the part that is felt immediately
# when it is missing.
set -u
RAW=${RAW:-/tmp/history.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
ESC=$(printf '\033'); UP="${ESC}[A"; DOWN="${ESC}[B"
( sleep 3;  printf ' '
  sleep 2;  printf 'مرحبا\r'
  sleep 20; printf 'ما اسمك\r'
  sleep 20; printf 'نص لم يرسل بعد'        # a draft, deliberately unsent
  sleep 3;  printf "%s" "$UP"              # → 'ما اسمك'
  sleep 3;  printf "%s" "$UP"              # → 'مرحبا'
  sleep 3;  printf "%s" "$DOWN"            # → 'ما اسمك'
  sleep 3;  printf "%s" "$DOWN"            # → the draft comes back
  sleep 4;  printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-120} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
