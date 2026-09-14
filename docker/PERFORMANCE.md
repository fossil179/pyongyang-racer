# Performance — Selkies browser stream

## Why streaming differs from the Mac app

| Factor | Mac app | Cloud + Selkies |
|--------|---------|-----------------|
| CPU | Direct local execution | Flash plus video/audio encoding |
| Display | Direct GPU → screen | Flash → Xvfb → H.264 → WebCodecs |
| Audio | Direct output | PulseAudio → Opus → browser |
| Input | Local keyboard/mouse | Events sent over WebSocket |

## Current profile

- 760×500, 24-bit Xvfb display
- 30 FPS H.264 software encoding
- 96 kbps Opus audio from `output.monitor`
- One HTTPS/WebSocket endpoint through Caddy and the queue gateway
- No desktop environment or window manager

## Server sizing

| VM | Expected result |
|----|-----------------|
| Shared/free micro VM | Not recommended; encoding will frequently stall |
| **2 vCPU / 4 GB** | Minimum for one player |
| **4 vCPU / 8 GB** | Better frame pacing and latency |
| Supported GPU VM | Best streaming result using hardware H.264 |

The current deployment is one shared Flash session. The in-memory gateway
admits one active browser and keeps later visitors in a bounded queue; it does
not create independent game processes. Multiple simultaneous players require
one container/session per player and an orchestrator.

The queue shell remains the top-level page and embeds Selkies under `/stream/`.
Its 15-second heartbeat is intentionally independent of Selkies' video and
audio WebSocket traffic. Static assets and stream frames are passed through
without buffering or content inspection; Caddy and the gateway both support
WebSocket upgrades.

## Tips

- Place the VM geographically near most players.
- Use a current Chrome, Edge, Firefox or Safari.
- Click inside the stream once to enable browser audio and keyboard capture.
- Keep the player at its native 760×500 resolution.

## Measuring

```bash
docker stats
docker compose -f docker/docker-compose.yml exec pyongyang-racer \
  tail -f /tmp/logs/selkies.log /tmp/logs/pulseaudio.log /tmp/logs/flash.log
curl -fsS https://game.pyongyangracer.com/healthz
```

If CPU stays near 100%, move to a larger VM or a supported GPU encoder.
If queue memory grows unexpectedly, verify `QUEUE_CAPACITY`,
`WAITING_EXPIRY_SECONDS`, and that only Caddy ports 80/443 are public.
