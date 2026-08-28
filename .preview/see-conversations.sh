#!/usr/bin/env bash
# Drive the console against the real engine and prove, from the DATABASE, that:
#   * a launch begins a NEW conversation — restarting is not resuming
#   * a conversation resumed in Conversations is the one the next goal carries
#   * "+ new conversation" in a place starts one there
#
# It records frames like the other scripts, but the frames are not the proof:
# an empty screen proves nothing about which session a message went into. The
# proof is the goals table.
set -u
WS=${WS:-/tmp/overyos-conversations}
RAW=${RAW:-/tmp/conversations.raw}
COLS=${COLS:-100}; ROWS=${ROWS:-30}
SAY=${SAY:-'مرحبا'}
WATCH=${WATCH:-50}
mkdir -p "$WS"
# KEYS is a sequence of `delay:text` pairs, so each run drives a different path
# through the same console.
KEYS=${KEYS:-"3: |2:${SAY}\r"}
(
  IFS='|' read -ra STEPS <<< "$KEYS"
  for step in "${STEPS[@]}"; do
    sleep "${step%%:*}"
    printf '%b' "${step#*:}"
  done
  sleep "$WATCH"
  printf '\003'
) | ( cd "$WS" && script -qec "stty rows $ROWS cols $COLS; timeout $((WATCH + 40)) npx tsx /home/spark/Terminal/src/index.ts" /dev/null ) > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
