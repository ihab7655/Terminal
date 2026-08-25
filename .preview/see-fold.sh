#!/usr/bin/env bash
# The folding, on the recorded session — where the timing is ours and no tokens
# are spent. Clicks the row of a write, then Tab for everything.
#
# Chasing this against a live goal does not work and should not be attempted:
# a real goal's timing varies by more than 2x (measured), so a fixed sleep lands
# before the tool arrives about as often as after it.
set -u
RAW=${RAW:-/tmp/fold.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-28}
ESC=$(printf '\033')
click() { printf "%s[<0;20;%sM%s[<0;20;%sm" "$ESC" "$1" "$ESC" "$1"; }
( sleep 2; printf ' '
  sleep 24                       # the whole recorded session plays out
  click "${ROW:-6}"; sleep 3     # open the write under the pointer
  click "${ROW:-6}"; sleep 2     # and shut it
  printf '\t'; sleep 3           # Tab: everything
  # Opening everything makes the transcript taller than the window, so the code
  # that just appeared is above it. Scroll back to look at it — which is also
  # rule 3 doing its job: nothing was shed to make room.
  printf "%s[5~" "$ESC"; sleep 2
  printf "%s[5~" "$ESC"; sleep 3
  printf '\t'; sleep 2           # and nothing
  printf '\003' ) \
  | DEMO=1 script -qec "stty rows $ROWS cols $COLS; timeout 60 npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
