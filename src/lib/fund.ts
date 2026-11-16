export interface FundLike {
  totalAmount: number;
  committedAmount: number;
  disbursedAmount: number;
}

export function summarizeFund(fund: FundLike, pendingAmount: number) {
  const available = fund.totalAmount - fund.committedAmount - fund.disbursedAmount;
  return {
    total: fund.totalAmount,
    committed: fund.committedAmount,
    disbursed: fund.disbursedAmount,
    available,
    pending: pendingAmount,
    uncommittedAfterPending: available - pendingAmount,
  };
}

export function checkFundCapacity(available: number, requested: number) {
  const shortfall = Math.max(0, requested - available);
  return { ok: shortfall === 0, shortfall };
}
