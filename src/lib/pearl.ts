import type { PearlAccountSnapshot } from "./types";

const PEARL_API = "https://pearlfortune.org/api/v1";
const DEFAULT_ADDRESS =
  "prl1ptd7756s8w54sne2j06nfkg5y2gxf3n97l9scp52mzgz0fkwgp2jsr222m5";

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "0";
}

function coinFromAtomic(value: unknown): string {
  const atomic = numberValue(value);
  if (atomic === 0) {
    return "0";
  }
  return (atomic / 100_000_000).toFixed(8).replace(/\.?0+$/, "");
}

async function fetchPearlJson(path: string): Promise<unknown> {
  const url = `${PEARL_API}${path}`;
  const proxyUrl = process.env.AWS_PROXY_URL;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 PearlDashboard/1.0",
  };

  let targetUrl = url;
  if (proxyUrl) {
    targetUrl = `${proxyUrl.replace(/\/$/, "")}?url=${encodeURIComponent(url)}`;
    if (process.env.AWS_PROXY_TOKEN) {
      headers.Authorization = `Bearer ${process.env.AWS_PROXY_TOKEN}`;
    }
  }

  const response = await fetch(targetUrl, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Pearl API failed ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function normalizePearlSnapshot(
  walletAddress: string,
  connections: unknown,
  miner: unknown,
  ledger: unknown,
  sampledAt = new Date(),
): PearlAccountSnapshot {
  const connectionsData =
    typeof connections === "object" && connections !== null
      ? (connections as { data?: Record<string, unknown> }).data
      : undefined;
  const minerData =
    typeof miner === "object" && miner !== null
      ? (miner as { data?: Record<string, unknown> }).data
      : undefined;
  const ledgerData =
    typeof ledger === "object" && ledger !== null
      ? (ledger as { data?: Record<string, unknown> }).data
      : undefined;
  const connectionSummary = connectionsData?.summary as
    | Record<string, unknown>
    | undefined;

  const pendingShares = minerData?.pending_shares as
    | Record<string, unknown>
    | undefined;
  const credits = minerData?.credits as Record<string, unknown> | undefined;

  return {
    sampled_at: sampledAt.toISOString(),
    wallet_address: walletAddress,
    worker_count: numberValue(
      connectionSummary?.worker_count ?? connectionsData?.worker_count,
    ),
    reported_gpus: numberValue(
      connectionSummary?.reported_gpus ?? connectionsData?.reported_gpus,
    ),
    reported_hashrate: numberValue(
      connectionSummary?.reported_hashrate ?? connectionsData?.reported_hashrate,
    ),
    pending_amount:
      stringValue(pendingShares?.pending_estimate_amount_coin) !== "0"
        ? stringValue(pendingShares?.pending_estimate_amount_coin)
        : coinFromAtomic(pendingShares?.pending_estimate_amount_atomic),
    credited_amount:
      stringValue(ledgerData?.sum_credit_amount_coin) !== "0"
        ? stringValue(ledgerData?.sum_credit_amount_coin)
        : stringValue(credits?.sum_amount_atomic) !== "0"
          ? coinFromAtomic(credits?.sum_amount_atomic)
          : "0",
    payout_amount: stringValue(ledgerData?.sum_payout_amount_coin),
    onchain_balance: null,
    raw_payload: {
      connections,
      miner,
      ledger,
    },
  };
}

export async function fetchPearlAccountSnapshot(
  walletAddress = process.env.PEARL_ADDRESS ?? DEFAULT_ADDRESS,
): Promise<PearlAccountSnapshot> {
  const encoded = encodeURIComponent(walletAddress);
  const [connections, miner, ledger] = await Promise.all([
    fetchPearlJson(`/miners/${encoded}/connections`),
    fetchPearlJson(`/miners/${encoded}`),
    fetchPearlJson(`/miners/${encoded}/ledger?page=1&page_size=10&entry_type=all`),
  ]);

  return normalizePearlSnapshot(walletAddress, connections, miner, ledger);
}
