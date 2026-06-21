import { describe, expect, it } from "vitest";
import { buildDashboardStatus, machineStatus } from "@/lib/dashboard";
import type { MachineSnapshot } from "@/lib/types";

function machine(lastSeenAt: string): MachineSnapshot {
  return {
    machine_name: "titan093",
    worker_name: "titan093-2x4090",
    status: "online",
    last_seen_at: lastSeenAt,
    miner_running: true,
    tunnel_running: true,
    gpu_mode: "all",
    raw_payload: {
      machine: "titan093",
      worker: "titan093-2x4090",
      timestamp: lastSeenAt,
      pearl: {
        miner_container_running: true,
        tunnel_container_running: true,
        image: "pearlfortune/pearl-miner:v1.1.6",
        gpu_mode: "all",
      },
      gpus: [],
    },
    gpus: [
      {
        index: 0,
        name: "NVIDIA GeForce RTX 4090",
        temperature_c: 66,
        utilization_pct: 99,
        power_w: 300,
        memory_used_mib: 11220,
        memory_total_mib: 24564,
      },
    ],
  };
}

describe("dashboard status", () => {
  it("marks machines stale after ten minutes", () => {
    const now = new Date("2026-06-21T10:15:00.000Z");

    expect(machineStatus("2026-06-21T10:06:00.000Z", now)).toBe("online");
    expect(machineStatus("2026-06-21T10:04:30.000Z", now)).toBe("stale");
  });

  it("summarizes online GPUs only", () => {
    const now = new Date("2026-06-21T10:05:00.000Z");
    const status = buildDashboardStatus(
      [
        machine("2026-06-21T10:04:00.000Z"),
        {
          ...machine("2026-06-21T09:54:00.000Z"),
          machine_name: "titan094",
        },
      ],
      null,
      now,
    );

    expect(status.summary.online_machines).toBe(1);
    expect(status.summary.stale_machines).toBe(1);
    expect(status.summary.total_active_gpus).toBe(1);
    expect(status.summary.average_temperature_c).toBe(66);
  });
});
