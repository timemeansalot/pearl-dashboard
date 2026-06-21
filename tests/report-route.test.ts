import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/agent/report/route";

const originalToken = process.env.TITAN_AGENT_TOKEN;

afterEach(() => {
  process.env.TITAN_AGENT_TOKEN = originalToken;
});

function request(body: unknown, token?: string) {
  return new Request("http://localhost/api/agent/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validReport = {
  machine: "titan093",
  worker: "titan093-2x4090",
  timestamp: "2026-06-21T10:00:00.000Z",
  pearl: {
    miner_container_running: true,
    tunnel_container_running: true,
    image: "10.234.1.250:5001/pearl-miner:v1.1.6",
    gpu_mode: "all",
  },
  gpus: [
    {
      index: 0,
      name: "NVIDIA GeForce RTX 4090",
      temperature_c: 66,
      utilization_pct: 99,
      power_w: 312,
      memory_used_mib: 11220,
      memory_total_mib: 24564,
    },
  ],
};

describe("agent report route", () => {
  it("rejects missing token when token is configured", async () => {
    process.env.TITAN_AGENT_TOKEN = "secret";

    const response = await POST(request(validReport));

    expect(response.status).toBe(401);
  });

  it("accepts a valid report", async () => {
    process.env.TITAN_AGENT_TOKEN = "secret";

    const response = await POST(request(validReport, "secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, machine: "titan093", gpu_count: 1 });
  });

  it("rejects unknown machines", async () => {
    process.env.TITAN_AGENT_TOKEN = "secret";

    const response = await POST(
      request({ ...validReport, machine: "unknown999" }, "secret"),
    );

    expect(response.status).toBe(403);
  });
});
