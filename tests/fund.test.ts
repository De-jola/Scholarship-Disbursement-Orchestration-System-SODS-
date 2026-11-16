import { describe, expect, it } from "vitest";
import { summarizeFund, checkFundCapacity } from "@/lib/fund";

describe("fund summary", () => {
  it("derives available funds from total, committed and disbursed", () => {
    const s = summarizeFund({ totalAmount: 1000, committedAmount: 200, disbursedAmount: 300 }, 150);
    expect(s.available).toBe(500);
    expect(s.pending).toBe(150);
    expect(s.uncommittedAfterPending).toBe(350);
  });
  it("accepts a batch within the available balance", () => {
    expect(checkFundCapacity(500, 500)).toEqual({ ok: true, shortfall: 0 });
  });
  it("blocks a batch above the available balance and reports the shortfall", () => {
    const r = checkFundCapacity(500, 650);
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBe(150);
  });
});
