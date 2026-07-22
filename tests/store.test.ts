import { describe, expect, it } from "vitest";
import { PostgresStore } from "@/lib/store";

const report = {
  machine: "titan093",
  worker: "titan093-2x4090",
  timestamp: "2026-07-22T01:00:00.000Z",
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

describe("PostgresStore", () => {
  it("removes GPU samples older than seven days after agent reports", async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql);
      },
      release() {},
    };
    const pool = {
      async query(sql: string) {
        queries.push(sql);
      },
      async connect() {
        return client;
      },
    };
    const store = new PostgresStore(pool);

    await store.saveAgentReport(report);

    expect(queries.join("\n")).toMatch(
      /delete from gpu_samples[\s\S]*sampled_at < now\(\) - interval '7 days'/i,
    );
  });
});
