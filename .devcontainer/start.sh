#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(
  docker compose
  -f docker/docker-compose.yml
  -f .devcontainer/docker-compose.codespaces.yml
)

if [[ -z "$("${COMPOSE[@]}" images -q pyongyang-racer)" ]]; then
  "${COMPOSE[@]}" build pyongyang-racer
fi

"${COMPOSE[@]}" up -d --no-deps pyongyang-racer

echo "Waiting for Pyongyang Racer..."
for _ in $(seq 1 120); do
  if curl -fsS -u racer:pyongyang http://localhost:6080/ >/dev/null 2>&1 \
      && "${COMPOSE[@]}" exec -T pyongyang-racer \
        pactl list short sources | grep -q output.monitor; then
    break
  fi
  sleep 1
done

if ! curl -fsS -u racer:pyongyang http://localhost:6080/ >/dev/null 2>&1; then
  echo "The game server did not start. Recent logs:"
  "${COMPOSE[@]}" logs --tail=100 pyongyang-racer
  exit 1
fi

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  URL="https://${CODESPACE_NAME}-6080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/"
else
  URL="http://localhost:6080/"
fi

echo
echo "Pyongyang Racer is ready:"
echo "  ${URL}"
echo "  Username: racer"
echo "  Password: pyongyang"
echo
echo "Open the forwarded port named 'Pyongyang Racer' in the Ports panel."
