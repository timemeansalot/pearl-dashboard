#!/usr/bin/env python3
"""Forward Titan dashboard agent reports to Vercel.

The proxy accepts POST /api/agent/report from Titan machines, validates a
separate REPORT_PROXY_TOKEN, then forwards the JSON body to the real Vercel
dashboard with VERCEL_AGENT_TOKEN. This lets Titans report through AWS without
storing the Vercel token or requiring direct Vercel network access.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    server_version = "PearlReportProxy/1.0"

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self.send_json(200, {"ok": True})
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/api/agent/report":
            self.send_json(404, {"error": "not_found"})
            return

        proxy_token = os.environ.get("REPORT_PROXY_TOKEN")
        if proxy_token and self.headers.get("Authorization") != f"Bearer {proxy_token}":
            self.send_json(401, {"error": "unauthorized"})
            return

        report_url = os.environ["VERCEL_REPORT_URL"]
        agent_token = os.environ["VERCEL_AGENT_TOKEN"]
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)

        try:
            json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "invalid_json"})
            return

        request = urllib.request.Request(
            report_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {agent_token}",
                "Content-Type": "application/json",
                "User-Agent": "pearl-report-proxy/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                response_body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(response_body)
        except urllib.error.HTTPError as exc:
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json"))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(exc.read())
        except Exception as exc:
            self.send_json(502, {"error": "forward_failed", "message": str(exc)})

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
    parser = argparse.ArgumentParser(description="Titan report proxy for Pearl Dashboard.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=18081)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
