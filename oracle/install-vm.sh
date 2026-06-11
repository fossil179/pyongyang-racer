#!/bin/bash
# Run once on a fresh Oracle Cloud Ubuntu VM (as ubuntu user with sudo).
set -euo pipefail

echo "==> Installing Docker..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "==> Opening port 6080 in local firewall (if ufw is active)..."
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q active; then
  sudo ufw allow 6080/tcp
fi

echo ""
echo "Docker installed. Log out and back in (or run: newgrp docker)"
echo "Then from the project folder run:  ./oracle/deploy.sh"
