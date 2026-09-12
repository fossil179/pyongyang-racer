#!/bin/bash
set -euo pipefail

mkdir -p "${XDG_RUNTIME_DIR}" "${PULSE_RUNTIME_PATH}"
chmod 700 "${XDG_RUNTIME_DIR}" "${PULSE_RUNTIME_PATH}"

echo "Starting PulseAudio with virtual output sink..." >&2
exec pulseaudio \
  --daemonize=no \
  --disallow-exit \
  --exit-idle-time=-1 \
  --log-target=stderr \
  --load="module-null-sink sink_name=output sink_properties=device.description=Pyongyang_Racer"
