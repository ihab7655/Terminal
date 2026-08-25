#!/usr/bin/env bash
# A click on a row, as a mouse sends it. Runs a goal that captures real output,
# then clicks the row a tool drew and clicks it again.
#
# The click is written as the terminal writes it — SGR: ESC[<0;col;rowM (press)
# then ...m (release). Both are sent, because a real mouse sends both, and only
# the press may act.
set -u
RAW=${RAW:-/tmp/click.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
ESC=$(printf '\033')
ROW=${ROW:-6}
click() { printf "%s[<0;20;%sM%s[<0;20;%sm" "$ESC" "$1" "$ESC" "$1"; }
( sleep 3;  printf ' '
  sleep 2;  printf 'اكتب ملف بايثون يطبع الارقام من واحد الى عشرة وشغله\r'
  sleep "${WORK:-110}"
  click "$ROW"; sleep 4      # open the row under the pointer
  click "$ROW"; sleep 4      # and close it again
  printf '\t'; sleep 4       # Tab still opens everything
  printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-200} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
