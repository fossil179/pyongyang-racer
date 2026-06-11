#!/bin/bash
# Build and start the game container on the Oracle/GCP VM.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run ./oracle/install-vm.sh first."
  exit 1
fi

PASS_FILE="docker/.vnc-password"
if [[ -n "${VNC_PASSWORD:-}" ]]; then
  printf '%s' "$VNC_PASSWORD" > "$PASS_FILE"
elif [[ -f "$PASS_FILE" ]]; then
  VNC_PASSWORD="$(cat "$PASS_FILE")"
else
  VNC_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  printf '%s' "$VNC_PASSWORD" > "$PASS_FILE"
fi
chmod 600 "$PASS_FILE"
export VNC_PASSWORD
printf 'VNC_PASSWORD=%s\n' "$VNC_PASSWORD" > docker/.env
chmod 600 docker/.env

echo "==> Stopping old container..."
$COMPOSE down --remove-orphans

echo "==> Building container (linux/amd64, may take a few minutes)..."
$COMPOSE build

echo "==> Starting Pyongyang Racer..."
$COMPOSE up -d --force-recreate

echo "==> Waiting for services..."
sleep 8

if $COMPOSE exec -T pyongyang-racer pgrep -x x11vnc >/dev/null 2>&1; then
  echo "OK: x11vnc is running"
else
  echo ""
  echo "ERROR: x11vnc failed to start. Diagnostic log:"
  $COMPOSE exec -T pyongyang-racer cat /var/log/supervisor/x11vnc.log 2>/dev/null || true
  $COMPOSE logs --tail=30
  exit 1
fi

PUBLIC_IP=$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=============================================="
echo " Pyongyang Racer is running!"
echo "=============================================="
echo ""
echo " Open in your browser (auto-connect, HTTPS):"
echo "   https://${PUBLIC_IP}:6080/vnc.html?autoconnect=1&password=${VNC_PASSWORD}"
echo ""
echo " VNC password (saved in docker/.vnc-password): ${VNC_PASSWORD}"
echo ""
echo " NOTE: Browser play has no sound (VNC limitation). Use the Mac app for audio."
echo ""
echo " Logs:  $COMPOSE logs -f"
