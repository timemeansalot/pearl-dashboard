#!/usr/bin/env python3
"""Push Titan Pearl miner and GPU status to the dashboard API."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


GPU_QUERY = (
    "index,name,utilization.gpu,temperature.gpu,power.draw,"
    "memory.used,memory.total"
)


def parse_number(value: str) -> float:
    value = value.strip()
    if value in {"", "N/A", "[Not Supported]"}:
        return 0.0
    return float(value)


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, text=True, capture_output=True)


def parse_nvidia_smi_csv(output: str) -> list[dict[str, Any]]:
    gpus: list[dict[str, Any]] = []
    for row in csv.reader(output.splitlines()):
        if len(row) != 7:
            continue
        gpus.append(
            {
                "index": int(row[0].strip()),
                "name": row[1].strip(),
                "utilization_pct": parse_number(row[2]),
                "temperature_c": parse_number(row[3]),
                "power_w": parse_number(row[4]),
                "memory_used_mib": parse_number(row[5]),
                "memory_total_mib": parse_number(row[6]),
            }
        )
    return gpus


def collect_gpus() -> list[dict[str, Any]]:
    proc = run_command(
        [
            "nvidia-smi",
            f"--query-gpu={GPU_QUERY}",
            "--format=csv,noheader,nounits",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "nvidia-smi failed")
    return parse_nvidia_smi_csv(proc.stdout)


def docker_names() -> set[str]:
    proc = run_command(["docker", "ps", "--format", "{{.Names}}"])
    if proc.returncode != 0:
        return set()
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def inspect_miner() -> tuple[str | None, str | None]:
    proc = run_command(["docker", "inspect", "pearl-miner"])
    if proc.returncode != 0:
        return None, None
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, None
    if not payload:
        return None, None

    config = payload[0].get("Config", {})
    host_config = payload[0].get("HostConfig", {})
    image = config.get("Image")
    gpu_mode = None

    device_requests = host_config.get("DeviceRequests") or []
    if device_requests:
        first = device_requests[0]
        device_ids = first.get("DeviceIDs") or []
        count = first.get("Count")
        if device_ids:
            gpu_mode = ",".join(device_ids)
        elif count == -1:
            gpu_mode = "all"
        elif count is not None:
            gpu_mode = str(count)

    return image, gpu_mode


def collect_report(machine: str, worker: str) -> dict[str, Any]:
    names = docker_names()
    image, gpu_mode = inspect_miner()
    return {
        "machine": machine,
        "worker": worker,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pearl": {
            "miner_container_running": "pearl-miner" in names,
            "tunnel_container_running": "pearl-pool-tunnel" in names,
            "image": image,
            "gpu_mode": gpu_mode,
        },
        "gpus": collect_gpus(),
    }


def post_report(dashboard_url: str, token: str, report: dict[str, Any]) -> None:
    endpoint = f"{dashboard_url.rstrip('/')}/api/agent/report"
    body = json.dumps(report).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "pearl-dashboard-agent/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status >= 300:
            raise RuntimeError(f"dashboard returned HTTP {response.status}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Report Titan GPU status to Pearl Dashboard.")
    parser.add_argument("--machine", required=True)
    parser.add_argument("--worker", required=True)
    parser.add_argument("--dashboard-url", required=True)
    parser.add_argument("--token", default=os.environ.get("TITAN_AGENT_TOKEN"))
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.token:
      print("missing --token or TITAN_AGENT_TOKEN", file=sys.stderr)
      return 2

    while True:
        try:
            report = collect_report(args.machine, args.worker)
            post_report(args.dashboard_url, args.token, report)
            print(
                f"reported machine={args.machine} gpus={len(report['gpus'])}",
                flush=True,
            )
        except (RuntimeError, urllib.error.URLError) as exc:
            print(f"report_failed={exc}", file=sys.stderr, flush=True)
            if args.once:
                return 1

        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
