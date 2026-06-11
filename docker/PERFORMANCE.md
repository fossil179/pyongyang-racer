# Performance — what to expect and how to improve

## Why browser play feels slower than the Mac app

| Factor | Mac app | Cloud + noVNC |
|--------|---------|---------------|
| CPU | Your Mac's full cores | GCP e2-micro: **1 shared vCPU** (~fraction of one core) |
| Display path | Direct GPU → screen | Flash → Xvfb → x11vnc → WebSocket → browser canvas |
| Encoding | None | Every frame compressed and sent over the network |
| Input | Direct keyboard/mouse | Keyboard/mouse events sent over WebSocket |

The game itself is identical; the **delivery pipeline** adds latency and caps frame rate.

## Optimizations already applied

- **16-bit colour** Xvfb (less data per frame)
- **x11vnc `-24to16`** (compress to 16 bpp on the wire)
- **Client-side caching** (`-ncache 10 -ncache_cr`)
- **Fast encoding profile** (`-speeds fast`)
- **Stream Flash window only** (not full desktop — fewer pixels)
- **512 MB shared memory** for X11
- **No window manager** (fluxbox removed — less CPU/RAM)

These typically improve responsiveness by **20–40%** on free tier, but will not make it feel like a native app.

## If you need better frame rate

| Option | Cost | Expected improvement |
|--------|------|---------------------|
| Stay on e2-micro + current setup | $0 | Baseline |
| **GCP e2-small** (2 vCPU, 2 GB) | ~$12/mo | Noticeable — recommended if you host publicly |
| **Oracle AMD E2.1.Micro** | $0 | Similar to e2-micro |
| **Mac app / play-correct.sh** | $0 | Best — no streaming overhead |

To upgrade on GCP: stop VM → change machine type to **e2-small** → start → redeploy.

## Tips for players

- Use a **wired connection** or strong Wi‑Fi
- **Close other tabs** — noVNC is CPU-heavy in the browser
- **Chrome or Firefox** (latest) generally perform best
- Don't resize the VNC window larger than 800×600 — scaling adds work

## Audio

**There is no sound in the browser version.** Standard VNC/noVNC carries video and keyboard/mouse only — it cannot stream Flash game audio to your browser. The Mac app (`play-correct.sh` or `Pyongyang-Racer.app.zip`) includes sound.

## Measuring

On the VM:

```bash
docker stats
docker compose -f docker/docker-compose.yml exec pyongyang-racer cat /var/log/supervisor/flash.log
```

If CPU is pegged at 100%, the VM is undersized for comfortable play.
