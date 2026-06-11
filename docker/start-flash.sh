#!/bin/bash
export DISPLAY=:99
cd /game/pyongyang

# SWF may load assets from its folder or parent paths used by the web build.
for f in /game/*.dat /game/*.txt /game/*.mp3; do
  [ -e "$f" ] && ln -sf "$f" .
done
[ -d /game/photo ] && ln -sfn /game/photo photo

# Wait for Xvfb + fluxbox to be ready.
sleep 10

echo "Starting Flash Player for PYracer.swf at $(date)" >&2
exec /opt/flash/flashplayer ./PYracer.swf
