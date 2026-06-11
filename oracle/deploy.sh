#!/bin/bash
# Build and start the game container on the Oracle/GCP VM.
set -euo pipefail
cd "$(dirname "$0")/.."

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

echo "==> Building container (linux/amd64, may take a few minutes)..."
docker compose -f docker/docker-compose.yml build

echo "==> Starting Pyongyang Racer..."
docker compose -f docker/docker-compose.yml up -d

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
echo " Security: restrict GCP/Oracle firewall port 6080 to your IP if possible."
echo " See docker/SECURITY.md for the full security model."
echo ""
echo " Your browser will warn about the self-signed certificate — click Advanced → Proceed."
echo ""
echo " Flash logs:  docker compose -f docker/docker-compose.yml exec pyongyang-racer tail -f /var/log/supervisor/flash.log"
echo " All logs:    docker compose -f docker/docker-compose.yml logs -f"
echo ""
echo " NOTE: Browser play has no sound (VNC limitation). Use the Mac app for audio."
echo ""
echo " If connection fails with 'downstream server' error, run:"
echo "   docker compose -f docker/docker-compose.yml logs"
echo " Password is in docker/.vnc-password (may not be 'pyongyang' anymore)."
