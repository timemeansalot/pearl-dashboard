export type GpuMetric = {
  index: number;
  name: string;
  temperature_c: number;
  utilization_pct: number;
  power_w: number;
  memory_used_mib: number;
  memory_total_mib: number;
};

export type PearlMachineState = {
  miner_container_running: boolean;
  tunnel_container_running: boolean;
  image: string | null;
  gpu_mode: string | null;
};

export type AgentReport = {
  machine: string;
  worker: string;
  timestamp: string;
  pearl: PearlMachineState;
  gpus: GpuMetric[];
};

export type MachineSnapshot = {
  machine_name: string;
  worker_name: string;
  status: "online" | "stale" | "offline";
  last_seen_at: string;
  miner_running: boolean;
  tunnel_running: boolean;
  gpu_mode: string | null;
  raw_payload: AgentReport;
  gpus: GpuMetric[];
};

export type PearlAccountSnapshot = {
  sampled_at: string;
  wallet_address: string;
  worker_count: number;
  reported_gpus: number;
  reported_hashrate: number;
  pending_amount: string;
  credited_amount: string;
  payout_amount: string;
  onchain_balance: string | null;
  raw_payload: unknown;
};

export type DashboardStatus = {
  generated_at: string;
  summary: {
    total_machines: number;
    online_machines: number;
    stale_machines: number;
    total_active_gpus: number;
    average_temperature_c: number | null;
    max_temperature_c: number | null;
    average_utilization_pct: number | null;
  };
  machines: MachineSnapshot[];
  pearl: PearlAccountSnapshot | null;
};
