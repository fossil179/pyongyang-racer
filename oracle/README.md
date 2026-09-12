# Play Pyongyang Racer online (graphics + browser sound)

Runs the **real Adobe Flash Player** in Docker and streams video, Opus audio,
keyboard and mouse input to a modern browser with
[Selkies](https://selkies-project.github.io/selkies/). Unlike Ruffle, this
preserves the original road, collision and 3D graphics.

**Also read:** [docker/SECURITY.md](../docker/SECURITY.md) · [docker/PERFORMANCE.md](../docker/PERFORMANCE.md)

## Requirements

- An x86 cloud VM running Ubuntu/Debian
- An **x86** VM — Flash Player does not run on ARM
- Assign a **public IP**
- At least **2 vCPU and 4 GB RAM** for software H.264 encoding
- DNS `A` record: `game.pyongyangracer.com` → VM public IP
- Open TCP ports **80** and **443** in the cloud firewall

Free micro VMs are not recommended: Flash, screen capture, H.264 and audio
encoding share the same CPU.

## Quick deploy

```bash
git clone https://github.com/fossil179/pyongyang-racer.git
cd pyongyang-racer
chmod +x oracle/*.sh docker/*.sh
./oracle/install-vm.sh          # installs Docker (Ubuntu/Debian)
# log out and back in, then:
./oracle/deploy.sh
```

The script builds the container, starts Selkies and Caddy, and creates an
auto-generated stream password in `docker/.stream-password`.

## Play

```
https://game.pyongyangracer.com/
```

Caddy obtains a trusted HTTPS certificate automatically after DNS points to
the VM. Sign in with user `racer` and the password printed by
`./oracle/deploy.sh`. Click once inside the stream so the browser permits audio.

## Security (summary)

- Players reach a non-root Docker container, not the VM desktop or shell.
- Selkies captures the isolated native-size 760×500 game display and PulseAudio output.
- Use the generated stream password; do not put it in public HTML.
- Only ports 80/443 are public. Selkies port 6080 stays inside Docker.

Full details: [docker/SECURITY.md](../docker/SECURITY.md)

## Performance (summary)

A 2-vCPU/4-GB VM is the minimum recommended size for one 800×600 stream.
This deployment is a **single shared session**, so one active player at a time
is recommended.

Full details: [docker/PERFORMANCE.md](../docker/PERFORMANCE.md)

## Change password

```bash
STREAM_USER=racer STREAM_PASSWORD='your-long-secret' ./oracle/deploy.sh
```

## Troubleshooting

**The domain does not load**
Confirm DNS points to the VM and cloud firewall ports 80/443 are open:
```bash
dig +short game.pyongyangracer.com
docker compose -f docker/docker-compose.yml logs caddy
```

**Login fails**
Read the generated password:
```bash
cat ~/pyongyang-racer/docker/.stream-password
```

**No sound**
Click once inside the player, check that the Selkies speaker control is
unmuted, then verify the monitor source:
```bash
docker compose -f docker/docker-compose.yml exec pyongyang-racer \
  pactl list short sources
```
The output must contain `output.monitor`.

```bash
docker compose -f docker/docker-compose.yml logs -f
docker compose -f docker/docker-compose.yml exec pyongyang-racer \
  tail -f /tmp/logs/selkies.log /tmp/logs/pulseaudio.log /tmp/logs/flash.log
```
