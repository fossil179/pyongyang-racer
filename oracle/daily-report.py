#!/usr/bin/env python3
"""Build and optionally email the daily Pyongyang Racer server report."""

from __future__ import annotations

import calendar
import datetime as dt
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request


GAME_HOST = os.getenv("GAME_HOST", "game.pyongyangracer.com")
GAME_URL = f"https://{GAME_HOST}/healthz"


def run(*command: str) -> str:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        output = result.stdout.strip() or result.stderr.strip()
        return output or "No output"
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"Unavailable: {exc}"


def website_status() -> str:
    request = urllib.request.Request(GAME_URL, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return f"healthy (HTTP {response.status})"
    except urllib.error.HTTPError as exc:
        return f"unhealthy (HTTP {exc.code})"
    except OSError as exc:
        return f"unhealthy ({exc})"


def certificate_expiry() -> str:
    try:
        context = ssl.create_default_context()
        with socket.create_connection((GAME_HOST, 443), timeout=10) as raw:
            with context.wrap_socket(raw, server_hostname=GAME_HOST) as secured:
                certificate = secured.getpeercert()
        expires = dt.datetime.strptime(
            certificate["notAfter"], "%b %d %H:%M:%S %Y %Z"
        ).replace(tzinfo=dt.timezone.utc)
        days = (expires - dt.datetime.now(dt.timezone.utc)).days
        return f"{expires.date().isoformat()} ({days} days remaining)"
    except (OSError, KeyError, ValueError, ssl.SSLError) as exc:
        return f"Unavailable: {exc}"


def estimated_cost() -> str:
    monthly = float(os.getenv("SERVER_MONTHLY_EUR", "35.49"))
    hourly = float(os.getenv("SERVER_HOURLY_EUR", "0.057"))
    created_text = os.getenv("SERVER_CREATED_AT", "")
    if not created_text:
        return f"up to EUR {monthly:.2f}/month, excluding chargeable overages"

    created = dt.datetime.fromisoformat(created_text.replace("Z", "+00:00"))
    now = dt.datetime.now(dt.timezone.utc)
    hours = max(0.0, (now - created).total_seconds() / 3600)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    month_cap = monthly
    estimate = min(hours * hourly, month_cap)
    return (
        f"approximately EUR {estimate:.2f} since {created.date().isoformat()}; "
        f"monthly cap EUR {month_cap:.2f}, excluding chargeable overages "
        f"({days_in_month}-day month)"
    )


def build_report() -> str:
    disk = shutil.disk_usage("/")
    disk_used = disk.used / disk.total * 100
    load = run("bash", "-lc", "cut -d' ' -f1-3 /proc/loadavg")
    pending_updates = run(
        "bash",
        "-lc",
        "apt list --upgradable 2>/dev/null | tail -n +2 | wc -l",
    )
    containers = run(
        "docker",
        "ps",
        "--format",
        "{{.Names}}: {{.Status}}",
    )
    restart_counts = run(
        "bash",
        "-lc",
        "docker inspect -f '{{.Name}}: {{.RestartCount}} restart(s)' "
        "$(docker ps -q) 2>/dev/null | sed 's#^/##'",
    )

    return "\n".join(
        [
            "Pyongyang Racer — daily server report",
            f"Generated: {dt.datetime.now(dt.timezone.utc).isoformat()}",
            "",
            f"Public game: {website_status()}",
            f"TLS certificate: {certificate_expiry()}",
            f"Server uptime: {run('uptime', '-p')}",
            f"Load: {load}",
            f"Memory: {run('free', '-h')}",
            f"Root disk used: {disk_used:.1f}%",
            "",
            "Containers:",
            containers,
            restart_counts,
            "",
            f"Docker service: {run('systemctl', 'is-active', 'docker')}",
            "Automatic security updates: "
            f"{run('systemctl', 'is-active', 'unattended-upgrades')}",
            f"Pending package updates: {pending_updates}",
            "",
            f"Estimated Hetzner cost: {estimated_cost()}",
            "Note: Hetzner's native project cost warning is the authoritative alert.",
        ]
    )


def send_report(report: str) -> None:
    api_key = os.environ["RESEND_API_KEY"]
    sender = os.environ["REPORT_FROM"]
    recipients = [
        address.strip()
        for address in os.getenv(
            "REPORT_TO", "koryotours@mac.com,media@budokan.tokyo"
        ).split(",")
        if address.strip()
    ]
    payload = json.dumps(
        {
            "from": sender,
            "to": recipients,
            "subject": "Pyongyang Racer daily server report",
            "text": report,
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "pyongyang-racer-monitor/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status >= 300:
            raise RuntimeError(f"Resend returned HTTP {response.status}")


def main() -> int:
    report = build_report()
    print(report)
    if "--send" in sys.argv:
        try:
            send_report(report)
        except (KeyError, OSError, RuntimeError, urllib.error.HTTPError) as exc:
            print(f"Email delivery failed: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
