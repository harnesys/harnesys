#!/bin/sh
# PID-1 supervisor for the unified image.
# HARNESYS_WEB_ENABLED=false -> host API only; otherwise host + web together.
# If either child exits, the container exits and Docker restarts it.

set -eu

if [ "${HARNESYS_WEB_ENABLED:-true}" = "false" ]; then
  exec bun apps/server/src/main.ts
fi

bun apps/server/src/main.ts &
HOST_PID=$!
bun apps/webui/server/index.ts &
WEB_PID=$!

trap 'kill "$HOST_PID" "$WEB_PID" 2>/dev/null || true' TERM INT

while kill -0 "$HOST_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

kill "$HOST_PID" "$WEB_PID" 2>/dev/null || true
exit 1
