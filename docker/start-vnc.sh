#!/bin/bash
sleep 2
PASS="${VNC_PASSWORD:-}"
[[ -z "$PASS" ]] && PASS="pyongyang"
PASSFILE=/tmp/vncpass
x11vnc -storepasswd "$PASS" "$PASSFILE"
exec x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth "$PASSFILE"
