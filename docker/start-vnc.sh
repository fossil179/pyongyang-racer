#!/bin/bash
# Start x11vnc immediately so noVNC always has a downstream on port 5900.
PASS="${VNC_PASSWORD:-}"
[[ -z "$PASS" ]] && PASS="pyongyang"
PASSFILE=/tmp/vncpass
x11vnc -storepasswd "$PASS" "$PASSFILE"
chmod 600 "$PASSFILE"
export DISPLAY=:99

echo "Starting x11vnc on :99 (port 5900) at $(date)" >&2
exec x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth "$PASSFILE" \
  -localhost -threads -ncache 10 -ncache_cr -24to16 -speeds fast -wait 10 -defer 10
