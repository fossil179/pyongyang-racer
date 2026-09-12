# Test Pyongyang Racer in GitHub Codespaces

1. Open <https://codespaces.new/fossil179/pyongyang-racer>.
2. Keep the default **2-core** machine and select **Create codespace**.
3. Wait for the initial container build (usually 5–10 minutes).
4. Open the **Ports** panel and click the forwarded port named
   **Pyongyang Racer**.
5. Sign in with:
   - Username: `racer`
   - Password: `pyongyang`
6. Click once inside the game to enable sound and keyboard controls.

The forwarded port is private to the GitHub account that created the
Codespace. Stop the Codespace when testing is finished so it does not consume
the monthly free compute allowance.

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
