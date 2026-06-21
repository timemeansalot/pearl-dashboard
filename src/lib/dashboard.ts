import type {
  DashboardStatus,
  MachineSnapshot,
  PearlAccountSnapshot,
} from "./types";

const STALE_MS = 10 * 60 * 1000;

export function machineStatus(
  lastSeenAt: string,
  now = new Date(),
): "online" | "stale" {
  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) {
    return "stale";
  }
  return now.getTime() - lastSeen > STALE_MS ? "stale" : "online";
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function buildDashboardStatus(
  machines: MachineSnapshot[],
  pearl: PearlAccountSnapshot | null,
  now = new Date(),
): DashboardStatus {
  const normalizedMachines = machines.map((machine) => ({
    ...machine,
    status: machineStatus(machine.last_seen_at, now),
  }));

  const onlineMachines = normalizedMachines.filter(
    (machine) => machine.status === "online",
  );
  const activeGpus = onlineMachines.flatMap((machine) => machine.gpus);
  const temperatures = activeGpus.map((gpu) => gpu.temperature_c);
  const utilizations = activeGpus.map((gpu) => gpu.utilization_pct);

  return {
    generated_at: now.toISOString(),
    summary: {
      total_machines: normalizedMachines.length,
      online_machines: onlineMachines.length,
      stale_machines: normalizedMachines.length - onlineMachines.length,
      total_active_gpus: activeGpus.length,
      average_temperature_c: roundNullable(average(temperatures)),
      max_temperature_c:
        temperatures.length === 0 ? null : Math.max(...temperatures),
      average_utilization_pct: roundNullable(average(utilizations)),
    },
    machines: normalizedMachines,
    pearl,
  };
}
