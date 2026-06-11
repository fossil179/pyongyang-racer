#!/bin/bash
# Play Pyongyang Racer with the original Adobe Flash Player for correct 3D graphics.
# Browser-based emulators (Ruffle) cannot yet render this game's textures properly.

set -euo pipefail
cd "$(dirname "$0")"

FLASH_APP="tools/Flash Player.app"
DMG_URL="https://github.com/Grubsic/Adobe-Flash-Player-Debug-Downloads-Archive/raw/main/Macintosh/flashplayer_32_sa.dmg"
SWF="$(pwd)/PY Racer_0509/PYracer.swf"

if [[ ! -d "$FLASH_APP" ]]; then
  echo "Downloading Adobe Flash Player projector (one-time setup)..."
  mkdir -p tools
  tmp_dmg="$(mktemp -t flashplayer.XXXXXX).dmg"
  mount_point="$(mktemp -d /tmp/flashplayer-mount.XXXXXX)"
  curl -fsSL "$DMG_URL" -o "$tmp_dmg"
  hdiutil attach "$tmp_dmg" -nobrowse -mountpoint "$mount_point" >/dev/null
  cp -R "$mount_point/Flash Player.app" "$FLASH_APP"
  hdiutil detach "$mount_point" -quiet
  rmdir "$mount_point"
  rm -f "$tmp_dmg"
  echo "Flash Player installed to $FLASH_APP"
fi

echo "Launching Pyongyang Racer with Adobe Flash Player..."
open -a "$(pwd)/$FLASH_APP" "$SWF"
