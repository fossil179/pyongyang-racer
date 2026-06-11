#!/bin/bash
# Build and start the game container on the Oracle VM.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run ./oracle/install-vm.sh first."
  exit 1
fi

export VNC_PASSWORD="${VNC_PASSWORD:-pyongyang}"

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
echo " Your browser will warn about the self-signed certificate — click Advanced → Proceed."
echo " If prompted for credentials, password is: ${VNC_PASSWORD}"
echo ""
echo " Flash logs:  docker compose -f docker/docker-compose.yml exec pyongyang-racer tail -f /var/log/supervisor/flash.log"
echo " (Change with: VNC_PASSWORD=yourpass ./oracle/deploy.sh)"
echo ""
echo " Also open port 6080 in Oracle Cloud Console:"
echo "   Networking > Virtual Cloud Network > Security List > Ingress Rules"
echo ""
echo " Logs:  docker compose -f docker/docker-compose.yml logs -f"
