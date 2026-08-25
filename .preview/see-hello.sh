#!/usr/bin/env bash
# The plainest thing a person does: open it and say hello.
#
# Exists because every tier was green and a targeted pty proof passed while this
# — the first interaction anyone has — showed a bare "completed" and no reply.
set -u
RAW=${RAW:-/tmp/hello.raw}; COLS=${COLS:-92}; ROWS=${ROWS:-30}
SAY=${SAY:-'مرحبا كيف حالك'}
( sleep 3; printf ' '
  sleep 2; printf '%s\r' "$SAY"
  sleep "${WATCH:-45}"; printf '\003' ) \
  | script -qec "stty rows $ROWS cols $COLS; timeout ${LIMIT:-90} npx tsx src/index.ts" /dev/null > "$RAW" 2>&1
echo "raw $(wc -c < "$RAW") bytes" >&2
