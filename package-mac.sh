#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
OUT="Pyongyang-Racer-Mac.zip"
rm -f "$OUT"
zip -r "$OUT" \
  play-correct.sh start.sh \
  racer.html racer.css racer_about.html racer_top10.html index.html \
  racer_images PY\ Racer_0509 photo ruffle \
  1.dat common.dat sound.dat symbol.dat common.txt info.txt PreGame.mp3 \
  .nojekyll
echo "Created $OUT"
