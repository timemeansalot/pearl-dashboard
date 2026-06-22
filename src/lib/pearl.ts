import type { PearlAccountSnapshot } from "./types";

const PEARL_API = "https://pearlfortune.org/api/v1";
const PRLSCAN_API = "https://api.prlscan.com/v1";
const DEFAULT_ADDRESS =
  "prl1ptd7756s8w54sne2j06nfkg5y2gxf3n97l9scp52mzgz0fkwgp2jsr222m5";
const DEFAULT_BSC_USDT_WALLET = "0xCC7dCD49fC03D52fCdA878dadd1C77588530689C";
const DEFAULT_BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const DEFAULT_BSC_RPC_URLS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.bnbchain.org",
];

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

function formatUnits(value: bigint, decimals: number): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function bscRpcUrls(): string[] {
  const configured = process.env.BSC_RPC_URLS?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_BSC_RPC_URLS;
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

async function fetchBscUsdtBalance(): Promise<string | null> {
  const wallet = process.env.BSC_USDT_WALLET ?? DEFAULT_BSC_USDT_WALLET;
  const contract = process.env.BSC_USDT_CONTRACT ?? DEFAULT_BSC_USDT_CONTRACT;
  const owner = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = `0x70a08231${owner}`;

  for (const rpcUrl of bscRpcUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data }, "latest"],
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as { result?: string };
      if (payload.result?.startsWith("0x")) {
        return formatUnits(BigInt(payload.result), 18);
      }
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function fetchPrlWalletBalance(walletAddress: string): Promise<string | null> {
  const apiUrl = process.env.PRLSCAN_API_URL ?? PRLSCAN_API;
  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/addresses/${encodeURIComponent(walletAddress)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 PearlDashboard/1.0",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { balance_grains?: number | string };
    return payload.balance_grains === undefined
      ? null
      : coinFromAtomic(payload.balance_grains);
  } catch {
    return null;
  }
}

export function normalizePearlSnapshot(
  walletAddress: string,
  connections: unknown,
  miner: unknown,
  ledger: unknown,
  sampledAt = new Date(),
  usdtBalance: string | null = null,
  walletBalance: string | null = null,
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
  const balance = minerData?.balance as Record<string, unknown> | undefined;
  const balances = Array.isArray(minerData?.balances)
    ? (minerData.balances as Record<string, unknown>[])
    : [];

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
    balance_amount:
      walletBalance ??
      coinFromAtomic(balance?.balance_atomic ?? balances[0]?.balance_atomic),
    usdt_balance: usdtBalance,
    raw_payload: {
      connections,
      miner,
      ledger,
      bsc_usdt_balance: usdtBalance,
      prl_wallet_balance: walletBalance,
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
  const [usdtBalance, walletBalance] = await Promise.all([
    fetchBscUsdtBalance(),
    fetchPrlWalletBalance(walletAddress),
  ]);

  return normalizePearlSnapshot(
    walletAddress,
    connections,
    miner,
    ledger,
    new Date(),
    usdtBalance,
    walletBalance,
  );
}
