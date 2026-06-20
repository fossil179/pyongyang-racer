#!/bin/bash
# Build an Android APK you can install directly (debug build, no Play Store needed).
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  else
    echo "Set JAVA_HOME to JDK 17+ (install: brew install openjdk@17)"
    exit 1
  fi
fi

if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  elif [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  else
    echo "Install Android SDK: brew install --cask android-commandlinetools"
    exit 1
  fi
fi

export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

npm install --silent 2>/dev/null || npm install
./sync-assets.sh
npx cap sync android

echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon

OUT="../Pyongyang-Racer-android.apk"
cp app/build/outputs/apk/debug/app-debug.apk "$OUT"
echo ""
echo "Built: $OUT"
echo "Install: copy to your phone and open, or: adb install -r $OUT"
