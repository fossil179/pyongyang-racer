# Test Pyongyang Racer in GitHub Codespaces

1. Open <https://codespaces.new/fossil179/pyongyang-racer>.
2. Keep the default **2-core** machine and select **Create codespace**.
3. Wait for the initial container build (usually 5–10 minutes).
4. Open the **Ports** panel and click the forwarded port named
   **Pyongyang Racer**.
5. Click once inside the game to enable sound and keyboard controls.

The forwarded test port is public because Codespaces' proxy does not pass
Selkies' HTTP authentication prompt correctly. Production deployment still
requires authentication. Stop the Codespace when testing is finished so the
link is closed and it does not consume the monthly free compute allowance.

To restart the game manually:

```bash
bash .devcontainer/start.sh
```

To view service logs:

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f .devcontainer/docker-compose.codespaces.yml \
  logs -f pyongyang-racer
```
