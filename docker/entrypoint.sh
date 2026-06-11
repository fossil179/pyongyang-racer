#!/bin/bash
set -euo pipefail

mkdir -p /var/log/supervisor
echo "Starting Pyongyang Racer (Flash Player + noVNC)..."
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
