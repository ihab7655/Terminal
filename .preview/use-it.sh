#!/usr/bin/env bash
# Use the console the way a person does, in a real pty, and record what the
# screen was sent. Not isolated cases — one continuous session, because the
# defects that mattered before were only ever visible in a sequence.
set -u
RAW=${RAW:-/tmp/use.raw}
COLS=${COLS:-90}
ROWS=${ROWS:-36}

ESC=$(printf '\033')
PGUP="${ESC}[5~"; PGDN="${ESC}[6~"; HOME_K="${ESC}[H"; END_K="${ESC}[F"

resize() {
  local pid pts
  pid=$(pgrep -n -f 'tsx src/index.ts' || true)
  [ -z "$pid" ] && return
  pts=$(readlink "/proc/$pid/fd/0" 2>/dev/null || true)
  case "$pts" in /dev/pts/*) stty -F "$pts" cols "$1" rows "$2" 2>/dev/null && echo "   · $1x$2" >&2 ;; esac
}

(
  sleep 7.5                       # tsx boots, then the opening runs to its name
  printf ' '                      # and a key skips it
  sleep 0.6
  for i in 1 2 3 4 5 6 7 8; do
    printf 'goal number %s, long enough that it wraps on a narrow window and keeps going\r' "$i"
    sleep 0.35
  done
  sleep 3.5                       # (resizes land here)
  printf '%s' "$PGUP";  sleep 0.8 # scroll back
  printf '%s' "$PGUP";  sleep 0.8
  printf '%s' "$HOME_K"; sleep 1.0 # to the very top
  sleep 2.0                        # (another resize here)
  printf '%s' "$END_K"; sleep 1.0  # back to following
  printf 'typing after all that'; sleep 1.2
  printf '\003'
) | script -qec "stty rows $ROWS cols $COLS; timeout 32 npx tsx src/index.ts" /dev/null > "$RAW" 2>&1 &
APP=$!

sleep 3.0;  resize 44 14   # DURING the opening, after it has drawn
sleep 6.2;  resize 60 16
sleep 1.2;  resize 40 12
sleep 1.2;  resize 110 28
sleep 5.0;  resize 55 34
wait $APP 2>/dev/null
echo "   raw $(wc -c < "$RAW") bytes" >&2
