#!/bin/bash
# One-time setup for iOS/Android builds (run on Mac for iOS).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install from https://nodejs.org/"
  exit 1
fi

echo "==> Installing npm dependencies..."
npm install

echo "==> Syncing game files..."
chmod +x sync-assets.sh
./sync-assets.sh

echo "==> Adding native platforms (skip if already added)..."
if [[ ! -d ios ]]; then
  npx cap add ios
fi
if [[ ! -d android ]]; then
  npx cap add android
fi

echo "==> Capacitor sync..."
npx cap sync

echo ""
echo "Setup complete."
echo ""
echo "  iOS (Mac + Xcode):     npm run cap:open:ios"
echo "  Android (Android Studio): npm run cap:open:android"
echo ""
echo "After changing www/ or game files: npm run cap:sync"
