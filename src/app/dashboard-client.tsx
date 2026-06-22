"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardStatus, GpuMetric, MachineSnapshot } from "@/lib/types";

function formatMetric(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return `${value}${suffix}`;
}

function formatHashrate(value: number) {
  if (!value) {
    return "0";
  }
  const units = [
    ["EH/s", 1e18],
    ["PH/s", 1e15],
    ["TH/s", 1e12],
  ] as const;
  for (const [unit, divisor] of units) {
    if (value >= divisor) {
      return `${(value / divisor).toFixed(2)} ${unit}`;
    }
  }
  return `${value.toLocaleString()} H/s`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) {
    return "--";
  }
  if (diff < 60_000) {
    return `${Math.max(0, Math.round(diff / 1000))}s`;
  }
  if (diff < 3_600_000) {
    return `${Math.round(diff / 60_000)}m`;
  }
  return `${Math.round(diff / 3_600_000)}h`;
}

function durationSince(iso: string | null) {
  if (!iso) {
    return "--";
  }
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) {
    return "--";
  }

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function statusClasses(status: MachineSnapshot["status"]) {
  if (status === "online") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

function tempClasses(temp: number) {
  if (temp >= 95) {
    return "text-red-300";
  }
  if (temp >= 85) {
    return "text-amber-200";
  }
  return "text-emerald-200";
}

function SummaryCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {subvalue ? <div className="mt-1 text-sm text-slate-400">{subvalue}</div> : null}
    </div>
  );
}

function GpuRow({ gpu }: { gpu: GpuMetric }) {
  const memoryPct =
    gpu.memory_total_mib > 0
      ? Math.round((gpu.memory_used_mib / gpu.memory_total_mib) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3 border-t border-white/10 py-3 text-sm md:grid-cols-6">
      <div>
        <div className="font-mono text-slate-300">GPU{gpu.index}</div>
        <div className="truncate text-xs text-slate-500">{gpu.name}</div>
      </div>
      <div>
        <div className={`font-mono text-lg font-semibold ${tempClasses(gpu.temperature_c)}`}>
          {gpu.temperature_c}C
        </div>
        <div className="text-xs text-slate-500">temperature</div>
      </div>
      <div>
        <div className="font-mono text-lg font-semibold text-sky-200">
          {gpu.utilization_pct}%
        </div>
        <div className="text-xs text-slate-500">utilization</div>
      </div>
      <div>
        <div className="font-mono text-lg font-semibold text-slate-100">
          {Math.round(gpu.power_w)}W
        </div>
        <div className="text-xs text-slate-500">power</div>
      </div>
      <div className="md:col-span-2">
        <div className="font-mono text-lg font-semibold text-slate-100">
          {Math.round(gpu.memory_used_mib).toLocaleString()} MiB
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-800">
          <div
            className="h-1.5 rounded-full bg-cyan-400"
            style={{ width: `${Math.min(100, memoryPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MachineBlock({ machine }: { machine: MachineSnapshot }) {
  const maxTemp =
    machine.gpus.length > 0
      ? Math.max(...machine.gpus.map((gpu) => gpu.temperature_c))
      : null;
  const avgUtil =
    machine.gpus.length > 0
      ? Math.round(
          machine.gpus.reduce((sum, gpu) => sum + gpu.utilization_pct, 0) /
            machine.gpus.length,
        )
      : null;

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">{machine.machine_name}</h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                machine.status,
              )}`}
            >
              {machine.status}
            </span>
          </div>
          <div className="mt-2 font-mono text-sm text-slate-400">{machine.worker_name}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
          <div>
            <div className="font-mono text-lg text-white">{machine.gpus.length}</div>
            <div className="text-slate-500">GPUs</div>
          </div>
          <div>
            <div className={`font-mono text-lg ${maxTemp ? tempClasses(maxTemp) : "text-white"}`}>
              {formatMetric(maxTemp, "C")}
            </div>
            <div className="text-slate-500">max temp</div>
          </div>
          <div>
            <div className="font-mono text-lg text-white">{formatMetric(avgUtil, "%")}</div>
            <div className="text-slate-500">avg util</div>
          </div>
          <div>
            <div className="font-mono text-lg text-white">{relativeTime(machine.last_seen_at)}</div>
            <div className="text-slate-500">last seen</div>
          </div>
          <div>
            <div className="font-mono text-lg text-white">{durationSince(machine.work_started_at)}</div>
            <div className="text-slate-500">uptime</div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <div className="rounded-md bg-white/[0.03] p-3">
          <div className="text-slate-500">miner</div>
          <div className="mt-1 text-slate-100">
            {machine.miner_running ? "running" : "stopped"}
          </div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-3">
          <div className="text-slate-500">tunnel</div>
          <div className="mt-1 text-slate-100">
            {machine.tunnel_running ? "running" : "stopped"}
          </div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-3">
          <div className="text-slate-500">gpu mode</div>
          <div className="mt-1 font-mono text-slate-100">{machine.gpu_mode ?? "--"}</div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-3">
          <div className="text-slate-500">reported</div>
          <div className="mt-1 font-mono text-slate-100">
            {new Date(machine.last_seen_at).toLocaleString()}
          </div>
        </div>
        <div className="rounded-md bg-white/[0.03] p-3">
          <div className="text-slate-500">started</div>
          <div className="mt-1 font-mono text-slate-100">
            {machine.work_started_at
              ? new Date(machine.work_started_at).toLocaleString()
              : "--"}
          </div>
        </div>
      </div>
      <div className="mt-5">
        {machine.gpus.map((gpu) => (
          <GpuRow key={`${machine.machine_name}-${gpu.index}`} gpu={gpu} />
        ))}
      </div>
    </section>
  );
}

export function DashboardClient({
  initialStatus,
}: {
  initialStatus: DashboardStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingPearl, setIsRefreshingPearl] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    setStatus(await response.json());
    setError(null);
  }, []);

  const refreshPearl = async () => {
    setIsRefreshingPearl(true);
    try {
      const response = await fetch("/api/cron/pearl", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`pearl ${response.status}`);
      }
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "pearl refresh failed");
    } finally {
      setIsRefreshingPearl(false);
    }
  };

  useEffect(() => {
    const refresh = async () => {
      try {
        await refreshStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "refresh failed");
      }
    };

    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  const sortedMachines = useMemo(
    () =>
      [...status.machines].sort((a, b) =>
        a.machine_name.localeCompare(b.machine_name),
      ),
    [status.machines],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Pearl Mining Dashboard</h1>
            <div className="mt-2 font-mono text-sm text-slate-400">
              {status.pearl?.wallet_address ?? "wallet not configured"}
            </div>
          </div>
          <div className="text-sm text-slate-400">
            updated {new Date(status.generated_at).toLocaleString()}
            {error ? <span className="ml-3 text-amber-300">refresh: {error}</span> : null}
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            label="online machines"
            value={`${status.summary.online_machines}/${status.summary.total_machines}`}
            subvalue={`${status.summary.stale_machines} stale`}
          />
          <SummaryCard
            label="active GPUs"
            value={String(status.summary.total_active_gpus)}
            subvalue={`${status.pearl?.reported_gpus ?? 0} pool reported`}
          />
          <SummaryCard
            label="avg temp"
            value={formatMetric(status.summary.average_temperature_c, "C")}
            subvalue={`max ${formatMetric(status.summary.max_temperature_c, "C")}`}
          />
          <SummaryCard
            label="avg util"
            value={formatMetric(status.summary.average_utilization_pct, "%")}
            subvalue="online machines only"
          />
          <SummaryCard
            label="PRL pending"
            value={status.pearl?.pending_amount ?? "0"}
            subvalue={`credited ${status.pearl?.credited_amount ?? "0"}`}
          />
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-200">Pearl Fortune account</div>
              <div className="mt-1 text-xs text-slate-500">
                Manual refresh updates pool workers, hashrate, pending, mined PRL, wallet PRL, and sold USDT.
              </div>
            </div>
            <button
              type="button"
              onClick={refreshPearl}
              disabled={isRefreshingPearl}
              className="inline-flex h-9 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshingPearl ? "Refreshing..." : "Refresh Pearl"}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">workers</div>
              <div className="mt-1 font-mono text-2xl text-white">
                {status.pearl?.worker_count ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">hashrate</div>
              <div className="mt-1 font-mono text-2xl text-white">
                {formatHashrate(status.pearl?.reported_hashrate ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">mined PRL</div>
              <div className="mt-1 font-mono text-2xl text-white">
                {status.pearl?.payout_amount ?? "0"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">wallet PRL</div>
              <div className="mt-1 font-mono text-2xl text-white">
                {status.pearl?.balance_amount ?? "0"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">sold USDT</div>
              <div className="mt-1 font-mono text-2xl text-white">
                {status.pearl?.usdt_balance ?? "--"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">pool refresh</div>
              <div className="mt-1 font-mono text-sm text-white">
                {status.pearl ? relativeTime(status.pearl.sampled_at) : "--"}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {sortedMachines.length > 0 ? (
            sortedMachines.map((machine) => (
              <MachineBlock key={machine.machine_name} machine={machine} />
            ))
          ) : (
            <section className="rounded-lg border border-dashed border-white/15 p-8 text-center text-slate-400">
              No Titan reports received yet.
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
