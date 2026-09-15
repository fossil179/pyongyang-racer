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
SESSION_SLOTS="${SESSION_SLOTS:-8}"
if [[ -S /var/run/docker.sock ]]; then
  DOCKER_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock)"
else
  echo "ERROR: /var/run/docker.sock is required for the session allocator" >&2
  exit 1
fi
export STREAM_USER STREAM_PASSWORD STREAM_DOMAIN SESSION_SLOTS DOCKER_GID
printf '%s\n' \
  "STREAM_USER=${STREAM_USER}" \
  "STREAM_PASSWORD=${STREAM_PASSWORD}" \
  "STREAM_DOMAIN=${STREAM_DOMAIN}" \
  "SESSION_SLOTS=${SESSION_SLOTS}" \
  "SESSION_IMAGE=pyongyang-racer-stream:live" \
  "DOCKER_GID=${DOCKER_GID}" \
  > docker/.env
chmod 600 docker/.env

echo "==> Stopping old stack and leftover player sessions..."
$COMPOSE --profile manual down --remove-orphans
docker rm -f docker-pyongyang-racer-1 >/dev/null 2>&1 || true
if docker ps -aq -f "label=racer.session=true" | grep -q .; then
  docker ps -aq -f "label=racer.session=true" | xargs docker rm -f
fi

echo "==> Building container images (linux/amd64, may take a few minutes)..."
$COMPOSE build pyongyang-racer queue-gateway

echo "==> Starting Pyongyang Racer session allocator..."
$COMPOSE up -d --force-recreate --remove-orphans queue-gateway caddy

echo "==> Waiting for the allocator..."
ALLOCATOR_READY=false
for _ in $(seq 1 60); do
  if $COMPOSE exec -T queue-gateway \
      node -e "require('http').get('http://127.0.0.1:8080/healthz',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(r.statusCode===200&&d.includes('\"allocator\":\"docker\"')?0:1))}).on('error',()=>process.exit(1))"; then
    ALLOCATOR_READY=true
    break
  fi
  sleep 1
done

if [[ "$ALLOCATOR_READY" == true ]]; then
  echo "OK: session allocator is running (${SESSION_SLOTS} slots)"
else
  echo ""
  echo "ERROR: session allocator health check failed"
  $COMPOSE logs --tail=80 queue-gateway
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
echo " Each visitor gets an isolated Flash session, up to ${SESSION_SLOTS} at once."
echo " Extra visitors wait in the queue. Turns last up to 15 minutes."
echo " Internal Selkies password saved in docker/.stream-password (do not share it)."
echo ""
echo " The first game can take up to a minute to start while its container boots."
echo " Click once inside the stream to allow browser audio and control the game."
echo " DNS requirement: ${STREAM_DOMAIN} must have an A record pointing to ${PUBLIC_IP}"
echo ""
echo " Logs:  $COMPOSE logs -f queue-gateway caddy"
echo " Sessions: docker ps -f label=racer.session=true"
