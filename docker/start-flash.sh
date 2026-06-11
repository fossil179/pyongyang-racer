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
exec /opt/flash/flashplayer ./PYracer.swf
