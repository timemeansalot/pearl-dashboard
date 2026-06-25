import { z } from "zod";

export const gpuMetricSchema = z.object({
  index: z.number().int().min(0),
  name: z.string().min(1),
  temperature_c: z.number().min(-40).max(130),
  utilization_pct: z.number().min(0).max(100),
  power_w: z.number().min(0).max(1000),
  memory_used_mib: z.number().min(0),
  memory_total_mib: z.number().min(0),
});

export const agentReportSchema = z.object({
  machine: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/),
  worker: z.string().min(1).max(128),
  timestamp: z.string().datetime({ offset: true }),
  pearl: z.object({
    miner_container_running: z.boolean(),
    tunnel_container_running: z.boolean(),
    image: z.string().nullable(),
    gpu_mode: z.string().nullable(),
  }),
  gpus: z.array(gpuMetricSchema).max(16),
});

const defaultMachines = Array.from({ length: 50 }, (_, index) => {
  const machineNumber = String(index + 51).padStart(3, "0");
  return `titan${machineNumber}`;
});

export function allowedMachines(): Set<string> {
  const value = process.env.ALLOWED_MACHINES;
  const extraMachines = value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return new Set([...defaultMachines, ...extraMachines]);
}

export function isAllowedMachine(machine: string): boolean {
  return allowedMachines().has(machine);
}

export function verifyBearerToken(headerValue: string | null): boolean {
  const expected = process.env.TITAN_AGENT_TOKEN;
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  return headerValue === `Bearer ${expected}`;
}
