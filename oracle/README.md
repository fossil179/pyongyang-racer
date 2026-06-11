# Play Pyongyang Racer online (real Flash via noVNC)

Runs the **real Adobe Flash Player** in Docker and streams it to the browser — correct 3D graphics. Works on **Oracle Cloud** or **Google Cloud** free x86 VMs.

**Also read:** [docker/SECURITY.md](../docker/SECURITY.md) · [docker/PERFORMANCE.md](../docker/PERFORMANCE.md)

## Requirements

- Cloud free account (Oracle or Google Cloud)
- An **x86** VM — Flash Player does not run on ARM
  - Oracle: **VM.Standard.E2.1.Micro** (AMD)
  - GCP: **e2-micro** in `us-central1`, `us-east1`, or `us-west1`
- Assign a **public IP**
- Open port **6080** (TCP) in cloud firewall

## Quick deploy

```bash
git clone https://github.com/fossil179/pyongyang-racer.git
cd pyongyang-racer
chmod +x oracle/*.sh docker/*.sh
./oracle/install-vm.sh          # installs Docker (Ubuntu/Debian)
# log out and back in, then:
./oracle/deploy.sh
```

The script prints an **HTTPS URL** and auto-generated **VNC password** (saved in `docker/.vnc-password`).

## Play

```
https://YOUR_VM_IP:6080/vnc.html?autoconnect=1&password=YOUR_PASSWORD
```

Accept the self-signed certificate warning (Advanced → Proceed).

## Security (summary)

- Players reach a **Docker container**, not your VM desktop or shell.
- VNC shows **only the Flash game window** — no terminal, no file manager.
- Use a **strong password** (auto-generated on first deploy).
- **Restrict firewall** port 6080 to your IP where possible (`YOUR_IP/32`).

Full details: [docker/SECURITY.md](../docker/SECURITY.md)

## Performance (summary)

Free **e2-micro** VMs are playable but not as smooth as the Mac app. For better frame rate, upgrade to **GCP e2-small** (~$12/mo).

Full details: [docker/PERFORMANCE.md](../docker/PERFORMANCE.md)

## Change password

```bash
VNC_PASSWORD='your-secret' ./oracle/deploy.sh
```

## Troubleshooting

**"Failed to connect to downstream server" (code 1011)**  
noVNC is up but x11vnc is not listening yet. Pull latest code and redeploy:
```bash
git pull && ./oracle/deploy.sh
```

**"password check failed"**  
The password may have changed from `pyongyang`. On the VM:
```bash
cat ~/pyongyang-racer/docker/.vnc-password
```
Or set a known password: `VNC_PASSWORD=pyongyang ./oracle/deploy.sh`

**No sound**  
Normal — VNC streams video only. Use the Mac app for sound.

```bash
docker compose -f docker/docker-compose.yml logs -f
docker compose -f docker/docker-compose.yml exec pyongyang-racer tail -f /var/log/supervisor/flash.log
```
