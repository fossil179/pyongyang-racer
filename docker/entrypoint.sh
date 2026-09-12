#!/bin/bash
set -euo pipefail

mkdir -p /tmp/logs "${XDG_RUNTIME_DIR:-/tmp/runtime-racer}"
echo "Starting Pyongyang Racer (Flash Player + Selkies video/audio stream)..."
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
