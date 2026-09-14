#!/bin/bash
# Build and start the game containers on an Ubuntu/Debian cloud VM.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run ./oracle/install-vm.sh first."
  exit 1
fi

PASS_FILE="docker/.stream-password"
if [[ -n "${STREAM_PASSWORD:-}" ]]; then
  printf '%s' "$STREAM_PASSWORD" > "$PASS_FILE"
elif [[ -f "$PASS_FILE" ]]; then
  STREAM_PASSWORD="$(cat "$PASS_FILE")"
else
  STREAM_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  printf '%s' "$STREAM_PASSWORD" > "$PASS_FILE"
fi
chmod 600 "$PASS_FILE"
STREAM_USER="${STREAM_USER:-racer}"
STREAM_DOMAIN="${STREAM_DOMAIN:-game.pyongyangracer.com}"
export STREAM_USER STREAM_PASSWORD STREAM_DOMAIN
printf 'STREAM_USER=%s\nSTREAM_PASSWORD=%s\nSTREAM_DOMAIN=%s\n' \
  "$STREAM_USER" "$STREAM_PASSWORD" "$STREAM_DOMAIN" > docker/.env
chmod 600 docker/.env

echo "==> Stopping old container..."
$COMPOSE down --remove-orphans

echo "==> Building container (linux/amd64, may take a few minutes)..."
$COMPOSE build

echo "==> Starting Pyongyang Racer..."
$COMPOSE up -d --force-recreate

echo "==> Waiting for services..."
SELKIES_READY=false
for _ in $(seq 1 120); do
  if $COMPOSE exec -T pyongyang-racer \
      curl -fsS --max-time 5 -u "${STREAM_USER}:${STREAM_PASSWORD}" \
        http://localhost:6080/ >/dev/null 2>&1; then
    SELKIES_READY=true
    break
  fi
  sleep 1
done

if [[ "$SELKIES_READY" == true ]]; then
  echo "OK: Selkies is running"
else
  echo ""
  echo "ERROR: Selkies failed to start. Diagnostic log:"
  $COMPOSE exec -T pyongyang-racer cat /tmp/logs/selkies.log 2>/dev/null || true
  $COMPOSE logs --tail=30
  exit 1
fi

if $COMPOSE exec -T queue-gateway \
    node -e "require('http').get('http://127.0.0.1:8080/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; then
  echo "OK: queue gateway is running"
else
  echo "ERROR: queue gateway health check failed"
  $COMPOSE logs --tail=30 queue-gateway
  exit 1
fi

if $COMPOSE exec -T pyongyang-racer pactl list short sources | grep -q output.monitor; then
  echo "OK: browser audio source is ready"
else
  echo "ERROR: PulseAudio output.monitor source is missing"
  $COMPOSE exec -T pyongyang-racer cat /tmp/logs/pulseaudio.log 2>/dev/null || true
  exit 1
fi

PUBLIC_IP=$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=============================================="
echo " Pyongyang Racer is running!"
echo "=============================================="
echo ""
echo " Open in your browser:"
echo "   https://${STREAM_DOMAIN}/"
echo ""
echo " Visitors join anonymously through the one-player queue."
echo " Internal Selkies password saved in docker/.stream-password (do not share it)."
echo ""
echo " Click once inside the stream to allow browser audio and control the game."
echo " DNS requirement: ${STREAM_DOMAIN} must have an A record pointing to ${PUBLIC_IP}"
echo ""
echo " Logs:  $COMPOSE logs -f"
