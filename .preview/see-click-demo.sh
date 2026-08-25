#!/usr/bin/env bash
# A click on a known row of the recorded session — no engine, no tokens.
# Row 11 is the failed bash call, whose captured traceback is folded to its last
# line. Clicking it must show the whole thing; clicking again must fold it back.
set -u
RAW=${RAW:-/tmp/clickdemo.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-28}
ESC=$(printf '\033')
click() { printf "%s[<0;20;%sM%s[<0;20;%sm" "$ESC" "$1" "$ESC" "$1"; }
( sleep 2; printf ' '
  sleep 10                    # let the recorded session reach the failed call
  click "${ROW:-11}"; sleep 3
  click "${ROW:-11}"; sleep 3
  printf '\003' ) \
  | DEMO=1 script -qec "stty rows $ROWS cols $COLS; timeout 40 npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
