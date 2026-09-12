#!/bin/bash
# Same SWF + asset layout as the Mac app (build-mac-app.sh / play-correct.sh).
export DISPLAY=:99
export HOME=/tmp/flash-home
mkdir -p "$HOME"
GAME="/game/PY Racer_0509"
cd "$GAME"

for f in /game/*.dat /game/*.txt /game/*.mp3; do
  [ -e "$f" ] && ln -sf "$f" .
done
[ -d /game/photo ] && ln -sfn /game/photo photo

sleep 3
echo "Starting Flash Player: $GAME/PYracer.swf at $(date)" >&2
/opt/flash/flashplayer ./PYracer.swf &
FLASH_PID=$!

terminate_flash() {
  kill -TERM "$FLASH_PID" 2>/dev/null || true
}
trap terminate_flash TERM INT HUP

# The standalone player opens with its application menu and URL bar visible.
# Ctrl+F hides that chrome; resizing afterwards makes the game fill the stream.
FLASH_WINDOW=""
for _ in $(seq 1 100); do
  kill -0 "$FLASH_PID" 2>/dev/null || break
  FLASH_WINDOW="$(xdotool search --onlyvisible --name '^Adobe Flash Player' 2>/dev/null | head -n 1)"
  [ -n "$FLASH_WINDOW" ] && break
  sleep 0.1
done

if [ -n "$FLASH_WINDOW" ]; then
  sleep 0.5
  xdotool key --clearmodifiers --window "$FLASH_WINDOW" ctrl+f
  xdotool windowmove "$FLASH_WINDOW" 0 0
  xdotool windowsize "$FLASH_WINDOW" 800 600
  echo "Flash Player chrome hidden; game window set to 800x600" >&2
else
  echo "Warning: Flash Player window was not found; leaving its layout unchanged" >&2
fi

wait "$FLASH_PID"
