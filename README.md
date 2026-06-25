# Pearl Mining Dashboard

Next.js dashboard for Pearl mining machines. Titan hosts push GPU and Pearl
container status to `/api/agent/report`; Vercel Cron refreshes Pearl Fortune
account data through `/api/cron/pearl`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without `DATABASE_URL`, the app uses an in-memory store. This is useful for
local UI testing but not persistent.

## Vercel environment variables

Required:

```text
DATABASE_URL
TITAN_AGENT_TOKEN
PEARL_ADDRESS
```

`titan051` through `titan100` are accepted by default. Set `ALLOWED_MACHINES`
only when you need to allow extra non-default machine names; values are merged
with the default Titan range.

Optional:

```text
ALLOWED_MACHINES
AWS_PROXY_URL
AWS_PROXY_TOKEN
```

Vercel Hobby accounts only allow daily Cron Jobs, so `vercel.json` refreshes
Pearl Fortune account data once per day. Titan machine GPU data is pushed by
the Titan reporter every 5 minutes and does not depend on Vercel Cron.

If Pearl Fortune returns 403 from Vercel or your local network, run
`scripts/aws_pearl_proxy.py` on `aws_verifier` or another overseas host:

```bash
export AWS_PROXY_TOKEN='replace-with-proxy-token'
nohup python3 scripts/aws_pearl_proxy.py --port 18080 \
  >/tmp/aws_pearl_proxy.log 2>&1 &
```

Then expose it through your preferred HTTPS reverse proxy and set:

```text
AWS_PROXY_URL=https://your-aws-host.example.com/fetch
AWS_PROXY_TOKEN=replace-with-proxy-token
```

## Titan reporter

Copy `scripts/pearl_dashboard_agent.py` to each Titan host and run:

```bash
python3 pearl_dashboard_agent.py \
  --machine titan094 \
  --worker titan094-2x4090 \
  --dashboard-url https://your-app.vercel.app \
  --token "$TITAN_AGENT_TOKEN"
```

Or export the token first so it is not visible in process arguments:

```bash
export TITAN_AGENT_TOKEN='replace-with-token-from-vercel'
python3 pearl_dashboard_agent.py \
  --machine titan094 \
  --worker titan094-2x4090 \
  --dashboard-url https://your-app.vercel.app
```

Single test report:

```bash
python3 pearl_dashboard_agent.py \
  --machine titan094 \
  --worker titan094-2x4090 \
  --dashboard-url https://your-app.vercel.app \
  --token "$TITAN_AGENT_TOKEN" \
  --once
```

For long-running use, run it under `tmux`, `nohup`, or a user-level systemd
unit. The script only reads `nvidia-smi` and Docker status; it does not start or
stop miners.

Machines are marked stale by the dashboard if no report is received for 10
minutes.

## API

`POST /api/agent/report`

```json
{
  "machine": "titan094",
  "worker": "titan094-2x4090",
  "timestamp": "2026-06-21T10:30:00+08:00",
  "pearl": {
    "miner_container_running": true,
    "tunnel_container_running": true,
    "image": "10.234.1.250:5001/pearl-miner:v1.1.6",
    "gpu_mode": "all"
  },
  "gpus": [
    {
      "index": 0,
      "name": "NVIDIA GeForce RTX 4090",
      "temperature_c": 66,
      "utilization_pct": 99,
      "power_w": 312,
      "memory_used_mib": 11220,
      "memory_total_mib": 24564
    }
  ]
}
```

The request must include:

```text
Authorization: Bearer <TITAN_AGENT_TOKEN>
```

If Titan machines cannot reach Vercel directly, run
`scripts/aws_report_proxy.py` on `aws_verifier` and point the agent at the AWS
proxy URL instead. In that mode, Titans use `REPORT_PROXY_TOKEN`, while AWS
injects the real Vercel `TITAN_AGENT_TOKEN`.

## Verification

```bash
npm run lint
npm run test
python3 -m unittest scripts/test_pearl_dashboard_agent.py
npm run build
```
