import { Pool } from "pg";
import { buildDashboardStatus } from "./dashboard";
import type {
  AgentReport,
  DashboardStatus,
  GpuMetric,
  MachineSnapshot,
  PearlAccountSnapshot,
} from "./types";

type Store = {
  saveAgentReport(report: AgentReport): Promise<void>;
  savePearlSnapshot(snapshot: PearlAccountSnapshot): Promise<void>;
  getDashboardStatus(): Promise<DashboardStatus>;
};

declare global {
  var __pearlDashboardMemoryStore: MemoryStore | undefined;
  var __pearlDashboardPgPool: Pool | undefined;
  var __pearlDashboardPgStore: PostgresStore | undefined;
}

class MemoryStore implements Store {
  private machines = new Map<string, MachineSnapshot>();
  private pearl: PearlAccountSnapshot | null = null;

  async saveAgentReport(report: AgentReport): Promise<void> {
    this.machines.set(report.machine, {
      machine_name: report.machine,
      worker_name: report.worker,
      status: "online",
      last_seen_at: report.timestamp,
      miner_running: report.pearl.miner_container_running,
      tunnel_running: report.pearl.tunnel_container_running,
      gpu_mode: report.pearl.gpu_mode,
      raw_payload: report,
      gpus: report.gpus,
    });
  }

  async savePearlSnapshot(snapshot: PearlAccountSnapshot): Promise<void> {
    this.pearl = snapshot;
  }

  async getDashboardStatus(): Promise<DashboardStatus> {
    return buildDashboardStatus(Array.from(this.machines.values()), this.pearl);
  }
}

class PostgresStore implements Store {
  private initialized = false;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.pool.query(`
      create table if not exists machines (
        machine_name text primary key,
        worker_name text not null,
        status text not null default 'online',
        last_seen_at timestamptz not null,
        miner_running boolean not null,
        tunnel_running boolean not null,
        gpu_mode text,
        raw_payload jsonb not null
      );

      create table if not exists gpu_samples (
        id bigserial primary key,
        machine_name text not null references machines(machine_name) on delete cascade,
        gpu_index integer not null,
        gpu_name text not null,
        sampled_at timestamptz not null,
        temperature_c double precision not null,
        utilization_pct double precision not null,
        power_w double precision not null,
        memory_used_mib double precision not null,
        memory_total_mib double precision not null
      );

      create index if not exists gpu_samples_machine_time_idx
        on gpu_samples(machine_name, sampled_at desc);

      create table if not exists pearl_account_snapshots (
        id bigserial primary key,
        sampled_at timestamptz not null,
        wallet_address text not null,
        worker_count integer not null,
        reported_gpus integer not null,
        reported_hashrate double precision not null,
        pending_amount text not null,
        credited_amount text not null,
        payout_amount text not null,
        onchain_balance text,
        raw_payload jsonb not null
      );

      create index if not exists pearl_account_snapshots_sampled_idx
        on pearl_account_snapshots(sampled_at desc);
    `);

    this.initialized = true;
  }

  async saveAgentReport(report: AgentReport): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
        insert into machines (
          machine_name, worker_name, status, last_seen_at,
          miner_running, tunnel_running, gpu_mode, raw_payload
        )
        values ($1, $2, 'online', $3, $4, $5, $6, $7)
        on conflict (machine_name) do update set
          worker_name = excluded.worker_name,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at,
          miner_running = excluded.miner_running,
          tunnel_running = excluded.tunnel_running,
          gpu_mode = excluded.gpu_mode,
          raw_payload = excluded.raw_payload
        `,
        [
          report.machine,
          report.worker,
          report.timestamp,
          report.pearl.miner_container_running,
          report.pearl.tunnel_container_running,
          report.pearl.gpu_mode,
          JSON.stringify(report),
        ],
      );

      for (const gpu of report.gpus) {
        await client.query(
          `
          insert into gpu_samples (
            machine_name, gpu_index, gpu_name, sampled_at, temperature_c,
            utilization_pct, power_w, memory_used_mib, memory_total_mib
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            report.machine,
            gpu.index,
            gpu.name,
            report.timestamp,
            gpu.temperature_c,
            gpu.utilization_pct,
            gpu.power_w,
            gpu.memory_used_mib,
            gpu.memory_total_mib,
          ],
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async savePearlSnapshot(snapshot: PearlAccountSnapshot): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      insert into pearl_account_snapshots (
        sampled_at, wallet_address, worker_count, reported_gpus,
        reported_hashrate, pending_amount, credited_amount, payout_amount,
        onchain_balance, raw_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        snapshot.sampled_at,
        snapshot.wallet_address,
        snapshot.worker_count,
        snapshot.reported_gpus,
        snapshot.reported_hashrate,
        snapshot.pending_amount,
        snapshot.credited_amount,
        snapshot.payout_amount,
        snapshot.onchain_balance,
        JSON.stringify(snapshot.raw_payload),
      ],
    );
  }

  async getDashboardStatus(): Promise<DashboardStatus> {
    await this.ensureSchema();
    const machineRows = await this.pool.query<{
      machine_name: string;
      worker_name: string;
      status: "online" | "stale" | "offline";
      last_seen_at: Date;
      miner_running: boolean;
      tunnel_running: boolean;
      gpu_mode: string | null;
      raw_payload: AgentReport;
    }>(`
      select machine_name, worker_name, status, last_seen_at, miner_running,
        tunnel_running, gpu_mode, raw_payload
      from machines
      order by machine_name asc
    `);

    const gpuRows = await this.pool.query<{
      machine_name: string;
      gpu_index: number;
      gpu_name: string;
      temperature_c: number;
      utilization_pct: number;
      power_w: number;
      memory_used_mib: number;
      memory_total_mib: number;
    }>(`
      select distinct on (machine_name, gpu_index)
        machine_name, gpu_index, gpu_name, temperature_c, utilization_pct,
        power_w, memory_used_mib, memory_total_mib
      from gpu_samples
      order by machine_name, gpu_index, sampled_at desc
    `);

    const gpusByMachine = new Map<string, GpuMetric[]>();
    for (const row of gpuRows.rows) {
      const gpus = gpusByMachine.get(row.machine_name) ?? [];
      gpus.push({
        index: row.gpu_index,
        name: row.gpu_name,
        temperature_c: row.temperature_c,
        utilization_pct: row.utilization_pct,
        power_w: row.power_w,
        memory_used_mib: row.memory_used_mib,
        memory_total_mib: row.memory_total_mib,
      });
      gpusByMachine.set(row.machine_name, gpus);
    }

    const machines = machineRows.rows.map((row) => ({
      machine_name: row.machine_name,
      worker_name: row.worker_name,
      status: row.status,
      last_seen_at: row.last_seen_at.toISOString(),
      miner_running: row.miner_running,
      tunnel_running: row.tunnel_running,
      gpu_mode: row.gpu_mode,
      raw_payload: row.raw_payload,
      gpus: gpusByMachine.get(row.machine_name) ?? [],
    }));

    const pearlRows = await this.pool.query<{
      sampled_at: Date;
      wallet_address: string;
      worker_count: number;
      reported_gpus: number;
      reported_hashrate: number;
      pending_amount: string;
      credited_amount: string;
      payout_amount: string;
      onchain_balance: string | null;
      raw_payload: unknown;
    }>(`
      select sampled_at, wallet_address, worker_count, reported_gpus,
        reported_hashrate, pending_amount, credited_amount, payout_amount,
        onchain_balance, raw_payload
      from pearl_account_snapshots
      order by sampled_at desc
      limit 1
    `);

    const pearl = pearlRows.rows[0]
      ? {
          ...pearlRows.rows[0],
          sampled_at: pearlRows.rows[0].sampled_at.toISOString(),
        }
      : null;

    return buildDashboardStatus(machines, pearl);
  }
}

function getPool(): Pool {
  if (!globalThis.__pearlDashboardPgPool) {
    globalThis.__pearlDashboardPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });
  }
  return globalThis.__pearlDashboardPgPool;
}

export function getStore(): Store {
  if (process.env.DATABASE_URL) {
    if (!globalThis.__pearlDashboardPgStore) {
      globalThis.__pearlDashboardPgStore = new PostgresStore(getPool());
    }
    return globalThis.__pearlDashboardPgStore;
  }

  if (!globalThis.__pearlDashboardMemoryStore) {
    globalThis.__pearlDashboardMemoryStore = new MemoryStore();
  }
  return globalThis.__pearlDashboardMemoryStore;
}
