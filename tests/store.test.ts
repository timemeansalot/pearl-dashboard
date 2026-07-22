import { describe, expect, it } from "vitest";
import { getDatabaseUrl, PostgresStore } from "@/lib/store";

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

describe("database URL selection", () => {
  it("ignores system DATABASE_URL unless the Pearl dashboard database URL is set", () => {
    const originalDashboardUrl = process.env.PEARL_DASHBOARD_DATABASE_URL;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    try {
      delete process.env.PEARL_DASHBOARD_DATABASE_URL;
      process.env.DATABASE_URL = "postgres://system-neon-url";

      expect(getDatabaseUrl()).toBeUndefined();

      process.env.PEARL_DASHBOARD_DATABASE_URL = "postgres://dashboard-url";

      expect(getDatabaseUrl()).toBe("postgres://dashboard-url");
    } finally {
      if (originalDashboardUrl === undefined) {
        delete process.env.PEARL_DASHBOARD_DATABASE_URL;
      } else {
        process.env.PEARL_DASHBOARD_DATABASE_URL = originalDashboardUrl;
      }

      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });
});
