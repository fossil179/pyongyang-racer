#!/bin/bash
# Install daily reporting after a Resend sender domain has been verified.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${RESEND_API_KEY:-}" || -z "${REPORT_FROM:-}" ]]; then
  echo "Set RESEND_API_KEY and REPORT_FROM before installing reporting." >&2
  exit 1
fi

REPORT_TO="${REPORT_TO:-koryotours@mac.com,media@budokan.tokyo}"
SERVER_CREATED_AT="${SERVER_CREATED_AT:-2026-09-14T16:49:00Z}"
SERVER_HOURLY_EUR="${SERVER_HOURLY_EUR:-0.057}"
SERVER_MONTHLY_EUR="${SERVER_MONTHLY_EUR:-35.49}"

if [[ "$(realpath oracle/daily-report.py)" == "/opt/pyongyang-racer/oracle/daily-report.py" ]]; then
  sudo chmod 0755 oracle/daily-report.py
else
  sudo install -m 0755 oracle/daily-report.py /opt/pyongyang-racer/oracle/daily-report.py
fi
sudo install -m 0644 oracle/pyongyang-racer-report.service \
  /etc/systemd/system/pyongyang-racer-report.service
sudo install -m 0644 oracle/pyongyang-racer-report.timer \
  /etc/systemd/system/pyongyang-racer-report.timer

sudo install -m 0600 /dev/null /etc/pyongyang-racer-report.env
sudo tee /etc/pyongyang-racer-report.env >/dev/null <<EOF
RESEND_API_KEY=${RESEND_API_KEY}
REPORT_FROM=${REPORT_FROM}
REPORT_TO=${REPORT_TO}
SERVER_CREATED_AT=${SERVER_CREATED_AT}
SERVER_HOURLY_EUR=${SERVER_HOURLY_EUR}
SERVER_MONTHLY_EUR=${SERVER_MONTHLY_EUR}
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now pyongyang-racer-report.timer
sudo systemctl start pyongyang-racer-report.service

echo "Daily report installed. Next scheduled run:"
sudo systemctl list-timers pyongyang-racer-report.timer --no-pager
