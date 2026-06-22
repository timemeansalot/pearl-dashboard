"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardStatus, GpuMetric, MachineSnapshot } from "@/lib/types";

const SOLD_USDT_WALLET = "0xCC7dCD49fC03D52fCdA878dadd1C77588530689C";

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
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function tempClasses(temp: number) {
  if (temp >= 95) {
    return "text-red-600";
  }
  if (temp >= 85) {
    return "text-amber-700";
  }
  return "text-emerald-700";
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
    <div className="rounded-xl border border-stone-200 bg-[#f1eee8] p-5">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-neutral-950">{value}</div>
      {subvalue ? <div className="mt-2 text-sm text-stone-500">{subvalue}</div> : null}
    </div>
  );
}

function GpuRow({ gpu }: { gpu: GpuMetric }) {
  const memoryPct =
    gpu.memory_total_mib > 0
      ? Math.round((gpu.memory_used_mib / gpu.memory_total_mib) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3 border-t border-stone-200 py-3 text-sm md:grid-cols-6">
      <div>
        <div className="font-mono text-neutral-900">GPU{gpu.index}</div>
        <div className="truncate text-xs text-stone-500">{gpu.name}</div>
      </div>
      <div>
        <div className={`font-mono text-lg font-semibold ${tempClasses(gpu.temperature_c)}`}>
          {gpu.temperature_c}C
        </div>
        <div className="text-xs text-stone-500">temperature</div>
      </div>
      <div>
        <div className="font-mono text-lg font-semibold text-emerald-700">
          {gpu.utilization_pct}%
        </div>
        <div className="text-xs text-stone-500">utilization</div>
      </div>
      <div>
        <div className="font-mono text-lg font-semibold text-neutral-900">
          {Math.round(gpu.power_w)}W
        </div>
        <div className="text-xs text-stone-500">power</div>
      </div>
      <div className="md:col-span-2">
        <div className="font-mono text-lg font-semibold text-neutral-900">
          {Math.round(gpu.memory_used_mib).toLocaleString()} MiB
        </div>
        <div className="mt-2 h-2 rounded-full bg-stone-200">
          <div
            className="h-2 rounded-full bg-emerald-600"
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
    <section className="rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-neutral-950">{machine.machine_name}</h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                machine.status,
              )}`}
            >
              {machine.status}
            </span>
          </div>
          <div className="mt-2 font-mono text-sm text-stone-500">{machine.worker_name}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
          <div>
            <div className="font-mono text-lg text-neutral-950">{machine.gpus.length}</div>
            <div className="text-stone-500">GPUs</div>
          </div>
          <div>
            <div className={`font-mono text-lg ${maxTemp ? tempClasses(maxTemp) : "text-neutral-950"}`}>
              {formatMetric(maxTemp, "C")}
            </div>
            <div className="text-stone-500">max temp</div>
          </div>
          <div>
            <div className="font-mono text-lg text-neutral-950">{formatMetric(avgUtil, "%")}</div>
            <div className="text-stone-500">avg util</div>
          </div>
          <div>
            <div className="font-mono text-lg text-neutral-950">{relativeTime(machine.last_seen_at)}</div>
            <div className="text-stone-500">last seen</div>
          </div>
          <div>
            <div className="font-mono text-lg text-neutral-950">{durationSince(machine.work_started_at)}</div>
            <div className="text-stone-500">uptime</div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">miner</div>
          <div className="mt-1 text-neutral-900">
            {machine.miner_running ? "running" : "stopped"}
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">tunnel</div>
          <div className="mt-1 text-neutral-900">
            {machine.tunnel_running ? "running" : "stopped"}
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">gpu mode</div>
          <div className="mt-1 font-mono text-neutral-900">{machine.gpu_mode ?? "--"}</div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">reported</div>
          <div className="mt-1 font-mono text-neutral-900">
            {new Date(machine.last_seen_at).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">started</div>
          <div className="mt-1 font-mono text-neutral-900">
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
    <main className="min-h-screen bg-[#f7f6f3] text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 pb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-neutral-950">Pearl Mining Dashboard</h1>
            <div className="mt-2 font-mono text-sm text-stone-500">
              {status.pearl?.wallet_address ?? "wallet not configured"}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              updated {new Date(status.generated_at).toLocaleString()}
            </div>
            <div className="max-w-full break-all rounded-full bg-blue-50 px-3 py-1 text-left font-mono text-xs text-blue-700 md:text-right">
              Sold USDT EVM addr · {SOLD_USDT_WALLET}
            </div>
            {error ? <div className="text-sm text-amber-700">refresh: {error}</div> : null}
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

        <section className="mt-6 rounded-xl border border-emerald-500 bg-white p-6">
          <div className="mb-5 flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-neutral-900">Pearl Fortune account</div>
              <div className="mt-1 text-xs text-stone-500">
                Manual refresh updates pool workers, hashrate, pending, mined PRL, wallet PRL, and sold USDT.
              </div>
            </div>
            <button
              type="button"
              onClick={refreshPearl}
              disabled={isRefreshingPearl}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshingPearl ? "Refreshing..." : "Refresh Pearl"}
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">workers</div>
              <div className="mt-1 font-mono text-2xl text-neutral-950">
                {status.pearl?.worker_count ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">hashrate</div>
              <div className="mt-1 font-mono text-2xl text-neutral-950">
                {formatHashrate(status.pearl?.reported_hashrate ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">mined PRL</div>
              <div className="mt-1 font-mono text-2xl text-neutral-950">
                {status.pearl?.payout_amount ?? "0"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">wallet PRL</div>
              <div className="mt-1 font-mono text-2xl text-neutral-950">
                {status.pearl?.balance_amount ?? "0"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">sold USDT</div>
              <div className="mt-1 font-mono text-2xl text-emerald-700">
                {status.pearl?.usdt_balance ?? "--"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-500">pool refresh</div>
              <div className="mt-1 font-mono text-sm text-neutral-950">
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
            <section className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
              No Titan reports received yet.
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
