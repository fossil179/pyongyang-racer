#!/bin/bash
# Start x11vnc once Xvfb is ready so noVNC always has port 5900.
set -euo pipefail

PASS="${VNC_PASSWORD:-pyongyang}"
[[ -z "$PASS" ]] && PASS="pyongyang"
export DISPLAY=:99

echo "Waiting for X display :99..." >&2
for _ in $(seq 1 30); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! xdpyinfo -display :99 >/dev/null 2>&1; then
  echo "ERROR: X display :99 not available after 30s" >&2
  exit 1
fi

PASSFILE=/tmp/vncpass
x11vnc -storepasswd "$PASS" "$PASSFILE"
chmod 600 "$PASSFILE"

echo "Starting x11vnc on :99 (port 5900) at $(date)" >&2
exec x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth "$PASSFILE" \
  -localhost -threads -speeds fast -wait 10 -defer 10
