# Play Pyongyang Racer online (real Flash via noVNC)

This runs the **real Adobe Flash Player** in a Docker container and streams it to the browser with noVNC — correct 3D graphics, ~$0/month on Oracle Cloud.

## Requirements

- Oracle Cloud free account: https://www.oracle.com/cloud/free/
- An **x86 (AMD)** VM — Flash Player does not run on ARM
  - Shape: **VM.Standard.E2.1.Micro** (Always Free, up to 2 instances)
  - Image: **Ubuntu 22.04**
  - Assign a **public IP**

## Step 1 — Create the VM

1. Sign in to Oracle Cloud Console
2. **Compute → Instances → Create instance**
3. Name: `pyongyang-racer`
4. Image: Ubuntu 22.04
5. Shape: **Change shape → Ampere** is wrong for Flash — pick **AMD** → **VM.Standard.E2.1.Micro**
6. Networking: assign public IPv4
7. SSH keys: add your public key
8. Create

## Step 2 — Open port 6080

1. Go to your instance → **Subnet** link → **Security List**
2. **Add Ingress Rule:**
   - Source: `0.0.0.0/0`
   - IP Protocol: TCP
   - Destination port: `6080`
3. Save

## Step 3 — Copy the game to the server

From your Mac (replace `YOUR_VM_IP`):

```bash
ssh ubuntu@YOUR_VM_IP
# on the server:
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/fossil179/pyongyang-racer.git
cd pyongyang-racer
```

Or upload from your machine:

```bash
scp -r /Users/iufkytdf/Documents/Cursor/Racer ubuntu@YOUR_VM_IP:~/pyongyang-racer
```

## Step 4 — Install Docker and deploy

On the VM:

```bash
cd ~/pyongyang-racer
chmod +x oracle/*.sh docker/*.sh
./oracle/install-vm.sh
# log out and back in, then:
./oracle/deploy.sh
```

## Step 5 — Play

Open in your browser:

```
http://YOUR_VM_IP:6080/vnc.html
```

1. Click **Connect**
2. Enter VNC password: `pyongyang` (unless you changed it)
3. The game should appear in the Flash Player window

Change password:

```bash
VNC_PASSWORD=your-secret ./oracle/deploy.sh
```

## Link from your GitHub Pages site

After deploy, edit `racer.html` and set the play link to your server URL, or add to the About page.

## Security notes

- This exposes an old Flash runtime — only run the game, do not browse the open web in the container
- Change the default VNC password
- Consider restricting the Oracle security list to your IP instead of `0.0.0.0/0`

## Troubleshooting

```bash
docker compose -f docker/docker-compose.yml logs -f
docker compose -f docker/docker-compose.yml restart
```

If the page does not load, check Oracle ingress rule for port 6080 and that the VM shape is **x86**, not ARM.
