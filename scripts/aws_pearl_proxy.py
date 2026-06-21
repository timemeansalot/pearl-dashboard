#!/usr/bin/env python3
"""Tiny whitelisted Pearl Fortune fetch proxy for AWS.

Run this only on a trusted host. It accepts GET /fetch?url=... and forwards
requests to https://pearlfortune.org/api/v1/* when the bearer token matches.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ALLOWED_PREFIX = "https://pearlfortune.org/api/v1/"


class Handler(BaseHTTPRequestHandler):
    server_version = "PearlProxy/1.0"

    def do_GET(self) -> None:
        token = os.environ.get("AWS_PROXY_TOKEN")
        if token and self.headers.get("Authorization") != f"Bearer {token}":
            self.send_json(401, {"error": "unauthorized"})
            return

        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/fetch":
            self.send_json(404, {"error": "not_found"})
            return

        params = urllib.parse.parse_qs(parsed.query)
        target = params.get("url", [""])[0]
        if not target.startswith(ALLOWED_PREFIX):
            self.send_json(400, {"error": "url_not_allowed"})
            return

        try:
            request = urllib.request.Request(
                target,
                headers={"User-Agent": "Mozilla/5.0 PearlProxy/1.0"},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except Exception as exc:
            self.send_json(502, {"error": "upstream_failed", "message": str(exc)})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    parser = argparse.ArgumentParser(description="Pearl Fortune whitelisted proxy.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"listening on http://{args.host}:{args.port}/fetch", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
