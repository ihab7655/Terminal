#!/usr/bin/env bash
# Watch the console take a whole session: a call in flight, a failure, output
# longer than the window, a run of actions, and the view following it.
set -u
RAW=${RAW:-/tmp/console.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-28}
ESC=$(printf '\033'); PGUP="${ESC}[5~"; END_K="${ESC}[F"
( sleep 2; printf ' '                 # skip the opening
  sleep 22                            # the session plays
  printf '\t'; sleep 2                # unfold every output
  printf "%s" "$PGUP"; sleep 1.5      # read back
  printf "%s" "$PGUP"; sleep 1.5
  printf "%s" "$END_K"; sleep 1
  printf '\t'; sleep 1.5              # fold again
  printf '\003' ) \
  | DEMO=1 script -qec "stty rows $ROWS cols $COLS; timeout 45 npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
