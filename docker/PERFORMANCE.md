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
| **4 vCPU / 8 GB** | Current production size; target 8 isolated sessions |
| Supported GPU VM | Best streaming result using hardware H.264 |

The live gateway starts one isolated Flash/Selkies container per player, up to
`SESSION_SLOTS` (default 8). Extra visitors wait in the queue. Idle or expired
sessions are destroyed. The first start can take up to a minute while Xvfb,
Flash and Selkies come up.

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
docker ps -f label=racer.session=true
curl -fsS https://game.pyongyangracer.com/healthz
```

If CPU stays near 100%, move to a larger VM or a supported GPU encoder.
If queue memory grows unexpectedly, verify `QUEUE_CAPACITY`,
`WAITING_EXPIRY_SECONDS`, and that only Caddy ports 80/443 are public.
