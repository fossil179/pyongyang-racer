#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Waiting for the Codespaces Docker daemon..."
for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker info >/dev/null

cat > docker/.env <<'EOF'
STREAM_USER=racer
STREAM_PASSWORD=pyongyang
STREAM_DOMAIN=localhost
EOF
chmod 600 docker/.env

echo "Building the Pyongyang Racer test server..."
docker compose \
  -f docker/docker-compose.yml \
  -f .devcontainer/docker-compose.codespaces.yml \
  build pyongyang-racer

echo "Codespaces setup complete."
