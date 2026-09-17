#!/bin/bash
set -euo pipefail

STREAM_USER="${STREAM_USER:-racer}"
STREAM_PASSWORD="${STREAM_PASSWORD:-}"
STREAM_AUTH="${STREAM_AUTH:-true}"

if [[ "${STREAM_AUTH}" == "true" && -z "${STREAM_PASSWORD}" ]]; then
  echo "ERROR: STREAM_PASSWORD must be set" >&2
  exit 1
fi

echo "Waiting for X display and PulseAudio..." >&2
for _ in $(seq 1 60); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1 \
      && pactl info >/dev/null 2>&1 \
      && pactl list short sources | grep -q 'output.monitor'; then
    break
  fi
  sleep 1
done

if ! xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
  echo "ERROR: X display ${DISPLAY} is unavailable" >&2
  exit 1
fi
if ! pactl list short sources | grep -q 'output.monitor'; then
  echo "ERROR: PulseAudio monitor source output.monitor is unavailable" >&2
  exit 1
fi

echo "Starting Selkies stream with browser audio on port 6080..." >&2
exec /opt/selkies/app/AppRun \
  --addr=0.0.0.0 \
  --port=6080 \
  --mode=websockets \
  --enable-dual-mode=false \
  --enable-https=false \
  --enable-basic-auth="${STREAM_AUTH}" \
  --basic-auth-user="${STREAM_USER}" \
  --basic-auth-password="${STREAM_PASSWORD}" \
  --encoder=h264enc,jpeg \
  --use-cpu=true \
  --framerate=30-30 \
  --audio-device-name=output.monitor \
  --audio-bitrate=96000 \
  --enable-resize=false \
  --enable-clipboard=false \
  --gamepad-enabled=false \
  --file-transfers=none
