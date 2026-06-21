import { describe, expect, it } from "vitest";
import { normalizePearlSnapshot } from "@/lib/pearl";

describe("pearl normalization", () => {
  it("normalizes connection and ledger fields", () => {
    const snapshot = normalizePearlSnapshot(
      "prl1ptest",
      {
        data: {
          summary: {
            worker_count: 4,
            reported_gpus: 8,
            reported_hashrate: 2122105646203600,
          },
        },
      },
      {
        data: {
          pending_shares: {
            pending_estimate_amount_atomic: 125000000,
          },
        },
      },
      {
        data: {
          sum_credit_amount_coin: "2.5",
          sum_payout_amount_coin: "1",
        },
      },
      new Date("2026-06-21T10:00:00.000Z"),
    );

    expect(snapshot.worker_count).toBe(4);
    expect(snapshot.reported_gpus).toBe(8);
    expect(snapshot.pending_amount).toBe("1.25");
    expect(snapshot.credited_amount).toBe("2.5");
    expect(snapshot.payout_amount).toBe("1");
  });
});
