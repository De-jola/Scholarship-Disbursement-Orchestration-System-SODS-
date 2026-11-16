import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const NOW = new Date("2026-01-12T09:00:00.000Z");

beforeAll(async () => {
  prisma = await createSeededDb("metrics");
}, 120_000);
afterAll(async () => prisma.$disconnect());

describe("dashboard metrics", () => {
  it("computes fund and beneficiary KPIs from seeded data", async () => {
    const { getDashboardData } = await import("@/lib/metrics");
    const data = await getDashboardData(NOW);
    expect(data.kpis.totalFund).toBe(12_000_000);
    expect(data.kpis.committed).toBe(600_000);
    expect(data.kpis.disbursed).toBe(450_000);
    expect(data.kpis.available).toBe(10_950_000);
    expect(data.kpis.verified).toBe(24);
    expect(data.kpis.pendingVerifications).toBe(9);
    expect(data.kpis.batchesAwaitingApproval).toBe(1);
    expect(data.kpis.exceptions).toBe(2);
  });

  it("raises each alert category the demo relies on", async () => {
    const { getDashboardData } = await import("@/lib/metrics");
    const kinds = new Set((await getDashboardData(NOW)).alerts.map((a) => a.kind));
    for (const k of ["MISSING_CALENDAR", "EXPIRED_CALENDAR", "LATE_PORTAL_RESULT", "DUPLICATE_DECLARATION", "LOW_CONFIDENCE", "BATCH_AWAITING_APPROVAL"]) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });

  it("breaks verification status down across all 8 statuses and lists activity", async () => {
    const { getDashboardData } = await import("@/lib/metrics");
    const data = await getDashboardData(NOW);
    expect(data.statusBreakdown).toHaveLength(8);
    expect(data.statusBreakdown.reduce((s, r) => s + r.count, 0)).toBe(await prisma.beneficiary.count());
    expect(data.activity.length).toBeGreaterThan(0);
  });
});
