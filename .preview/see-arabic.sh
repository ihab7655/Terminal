#!/usr/bin/env bash
# The session that exposed all of this: Arabic in, an emoji back, and a long
# wait while the engine plans. Watch the opening first — it must not stutter.
set -u
RAW=${RAW:-/tmp/arabic.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
( sleep 12                                   # let the WHOLE opening play, untouched
  sleep 2;  printf 'مرحبا كيف حالك\r'
  sleep 25; printf 'ما اسمك\r'
  sleep 25; printf 'اكتب ملف بايثون يطبع الارقام من واحد الى عشرة\r'
  sleep "${WATCH:-70}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-200} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
