#!/bin/bash
# Copy game assets from repo root into mobile/www for Capacitor.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WWW="$(cd "$(dirname "$0")" && pwd)/www"

echo "Syncing game assets to mobile/www..."

rm -rf "$WWW/ruffle" "$WWW/PY Racer_0509" "$WWW/photo"
mkdir -p "$WWW"

cp -R "$ROOT/ruffle" "$WWW/"
cp -R "$ROOT/PY Racer_0509" "$WWW/"
cp -R "$ROOT/photo" "$WWW/"
cp "$ROOT/"{1.dat,common.dat,sound.dat,symbol.dat,common.txt,info.txt,PreGame.mp3} "$WWW/" 2>/dev/null || true

echo "Done. Assets in $WWW"
du -sh "$WWW/ruffle" "$WWW/PY Racer_0509" 2>/dev/null || true
