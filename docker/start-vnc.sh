#!/bin/bash
# Start x11vnc once Xvfb is ready so noVNC always has port 5900.
set -eu

PASS="${VNC_PASSWORD:-pyongyang}"
[[ -z "$PASS" ]] && PASS="pyongyang"
export DISPLAY=:99

echo "Waiting for X display :99..." >&2
ready=0
for _ in $(seq 1 30); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: X display :99 not available after 30s" >&2
  exit 1
fi

PASSFILE=/tmp/vncpass
if ! x11vnc -storepasswd "$PASS" "$PASSFILE" >&2; then
  echo "ERROR: x11vnc -storepasswd failed" >&2
  exit 1
fi
chmod 600 "$PASSFILE"

echo "Starting x11vnc on :99 (port 5900) at $(date)" >&2
# Keep flags minimal — invalid options (e.g. -speeds fast) exit immediately with code 1.
exec x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth "$PASSFILE" -localhost
