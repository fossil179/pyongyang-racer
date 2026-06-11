#!/bin/bash
# Build a double-clickable Pyongyang Racer.app for macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Pyongyang Racer"
APP="$ROOT/$APP_NAME.app"
CONTENTS="$APP/Contents"
RES="$CONTENTS/Resources"
GAME="$RES/game"
DMG_URL="https://github.com/Grubsic/Adobe-Flash-Player-Debug-Downloads-Archive/raw/main/Macintosh/flashplayer_32_sa.dmg"

echo "Building $APP_NAME.app..."

rm -rf "$APP"
mkdir -p "$CONTENTS/MacOS" "$RES" "$GAME"

# Bundle game files (Flash Player loads assets relative to the SWF folder).
cp -R "$ROOT/PY Racer_0509" "$GAME/"
cp "$ROOT/"{1.dat,common.dat,sound.dat,symbol.dat,common.txt,info.txt,PreGame.mp3} "$GAME/" 2>/dev/null || true
cp -R "$ROOT/photo" "$GAME/" 2>/dev/null || true

# Bundle or download Flash Player.
if [[ -d "$ROOT/tools/Flash Player.app" ]]; then
  cp -R "$ROOT/tools/Flash Player.app" "$RES/"
else
  echo "Downloading Adobe Flash Player..."
  tmp_dmg="$(mktemp -t flashplayer.XXXXXX).dmg"
  mount_point="$(mktemp -d /tmp/flashplayer-mount.XXXXXX)"
  curl -fsSL "$DMG_URL" -o "$tmp_dmg"
  hdiutil attach "$tmp_dmg" -nobrowse -mountpoint "$mount_point" >/dev/null
  cp -R "$mount_point/Flash Player.app" "$RES/"
  hdiutil detach "$mount_point" -quiet
  rmdir "$mount_point"
  rm -f "$tmp_dmg"
fi

# Launcher executable.
cat > "$CONTENTS/MacOS/$APP_NAME" << 'LAUNCHER'
#!/bin/bash
set -euo pipefail
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
SWF="$RES/game/PY Racer_0509/PYracer.swf"
FLASH="$RES/Flash Player.app"
if [[ ! -f "$SWF" ]]; then
  osascript -e 'display alert "Pyongyang Racer" message "Game files are missing from the app bundle." as critical'
  exit 1
fi
open -a "$FLASH" "$SWF"
LAUNCHER
chmod +x "$CONTENTS/MacOS/$APP_NAME"

# App icon from site artwork (optional).
if [[ -f "$ROOT/racer_images/koryotours_top_icon.jpg" ]]; then
  ICONSET="$RES/AppIcon.iconset"
  SRC_PNG="$RES/icon-source.png"
  mkdir -p "$ICONSET"
  sips -s format png "$ROOT/racer_images/koryotours_top_icon.jpg" --out "$SRC_PNG" >/dev/null
  sips -z 16 16   "$SRC_PNG" --out "$ICONSET/icon_16x16.png" >/dev/null
  sips -z 32 32   "$SRC_PNG" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
  sips -z 32 32   "$SRC_PNG" --out "$ICONSET/icon_32x32.png" >/dev/null
  sips -z 64 64   "$SRC_PNG" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$SRC_PNG" --out "$ICONSET/icon_128x128.png" >/dev/null
  sips -z 256 256 "$SRC_PNG" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$SRC_PNG" --out "$ICONSET/icon_256x256.png" >/dev/null
  sips -z 512 512 "$SRC_PNG" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$SRC_PNG" --out "$ICONSET/icon_512x512.png" >/dev/null
  cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_512x512@2x.png"
  if iconutil -c icns "$ICONSET" -o "$RES/AppIcon.icns"; then
    rm -f "$SRC_PNG"
  fi
  rm -rf "$ICONSET"
fi

ICON_PLIST=""
if [[ -f "$RES/AppIcon.icns" ]]; then
  ICON_PLIST="  <key>CFBundleIconFile</key>
  <string>AppIcon</string>"
fi

cat > "$CONTENTS/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
$ICON_PLIST
  <key>CFBundleIdentifier</key>
  <string>com.koryotours.pyongyangracer</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.13</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "pkgutil --expand" >/dev/null
printf 'APPL????' > "$CONTENTS/PkgInfo"

echo "Created: $APP"
du -sh "$APP"
