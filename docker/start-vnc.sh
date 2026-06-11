#!/bin/bash
# Stream only the Flash Player window (not the full desktop).
PASS="${VNC_PASSWORD:-}"
[[ -z "$PASS" ]] && PASS="pyongyang"
PASSFILE=/tmp/vncpass
x11vnc -storepasswd "$PASS" "$PASSFILE"
chmod 600 "$PASSFILE"
export DISPLAY=:99

VNC_OPTS=(
  -display :99
  -forever
  -shared
  -rfbport 5900
  -rfbauth "$PASSFILE"
  -localhost
  -threads
  -ncache 10
  -ncache_cr
  -24to16
  -speeds fast
  -wait 10
  -defer 10
)

find_flash_window() {
  local pid win
  pid=$(pgrep -x flashplayer 2>/dev/null || true)
  [ -z "$pid" ] && return 1
  win=$(xdotool search --pid "$pid" 2>/dev/null | head -1)
  [ -n "$win" ] || return 1
  echo "$win"
}

while true; do
  echo "Waiting for Flash Player window..." >&2
  WIN=""
  for _ in $(seq 1 90); do
    WIN=$(find_flash_window) && break
    sleep 1
  done

  if [ -n "$WIN" ]; then
    echo "Streaming Flash window $WIN only (desktop hidden)" >&2
    x11vnc "${VNC_OPTS[@]}" -id "$WIN" &
  else
    echo "Warning: Flash window not found, streaming display :99" >&2
    x11vnc "${VNC_OPTS[@]}" &
  fi
  VNC_PID=$!

  while kill -0 "$VNC_PID" 2>/dev/null; do
    if ! pgrep -x flashplayer >/dev/null 2>&1; then
      kill "$VNC_PID" 2>/dev/null
      wait "$VNC_PID" 2>/dev/null
      break
    fi
    sleep 2
  done

  wait "$VNC_PID" 2>/dev/null
  sleep 2
done
