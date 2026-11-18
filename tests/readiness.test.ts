import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const JAN = new Date("2026-01-12T09:00:00.000Z");
const DEC = new Date("2025-12-02T09:00:00.000Z");
const OCT = new Date("2025-10-01T09:00:00.000Z");

beforeAll(async () => {
  prisma = await createSeededDb("readiness");
}, 120_000);
afterAll(async () => prisma.$disconnect());

async function readyByUni(now: Date) {
  const { getReadinessMap } = await import("@/lib/readiness");
  const map = await getReadinessMap(now);
  const people = await prisma.beneficiary.findMany({ include: { university: true } });
  const out: Record<string, number> = {};
  for (const p of people) if (map.get(p.id)?.ready) out[p.university.shortName] = (out[p.university.shortName] ?? 0) + 1;
  return out;
}

describe("getReadinessMap", () => {
  it("at the January demo date, four universities each have payment-ready beneficiaries", async () => {
    expect(await readyByUni(JAN)).toEqual({ ABU: 1, DELSU: 1, RSU: 1, FUTMINNA: 2 });
  });

  it("is calendar-aware: only universities whose payment window has opened are ready", async () => {
    expect(await readyByUni(OCT)).toEqual({ ABU: 1 });
    expect(await readyByUni(DEC)).toEqual({ ABU: 1, DELSU: 1, FUTMINNA: 2 });
  });

  it("explains why seeded edge cases are not ready", async () => {
    const { getReadinessMap } = await import("@/lib/readiness");
    const map = await getReadinessMap(JAN);
    const by = async (where: object) => prisma.beneficiary.findFirstOrThrow({ where });

    const dup = await by({ exceptionType: "DUPLICATE_SCHOLARSHIP" });
    expect(map.get(dup.id)!.category.key).toBe("DUPLICATE");

    const pendingCal = await by({ university: { shortName: "UNIJOS" }, verificationStatus: "VERIFIED" });
    expect(map.get(pendingCal.id)!.category.key).toBe("AWAITING_CALENDAR");

    const noToken = await by({ bankAccountToken: null });
    expect(map.get(noToken.id)!.reasons.map((r) => r.code)).toContain("NO_BANK_TOKEN");

    const batched = await prisma.paymentBatchItem.findFirstOrThrow({ where: { batch: { status: "APPROVED" } } });
    expect(map.get(batched.beneficiaryId)!.category.key).toBe("IN_BATCH");

    const rejected = await by({ verificationStatus: "REJECTED" });
    expect(map.get(rejected.id)!.category.key).toBe("REJECTED");
    const pendingVerif = await by({ verificationStatus: "REVIEW_PENDING" });
    expect(map.get(pendingVerif.id)!.category.key).toBe("VERIFICATION_PENDING");
  });

  it("respects the available fund, net of draft and pending batches", async () => {
    const { getReadinessMap } = await import("@/lib/readiness");
    const fund = await prisma.fundAllocation.findFirstOrThrow();
    const open = await prisma.paymentBatch.findMany({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } } });
    const earmarked = open.reduce((s, b) => s + b.totalAmount, 0);
    const original = fund.totalAmount;
    // Leave room for exactly one more 150,000 payment after already-earmarked batches.
    await prisma.fundAllocation.update({ where: { id: fund.id }, data: { totalAmount: fund.committedAmount + fund.disbursedAmount + earmarked + 150_000 } });
    const map = await getReadinessMap(JAN);
    const ready = [...map.values()].filter((r) => r.ready).length;
    const short = [...map.values()].filter((r) => r.category.key === "FUNDS").length;
    expect(ready).toBe(1);
    expect(short).toBe(4);
    await prisma.fundAllocation.update({ where: { id: fund.id }, data: { totalAmount: original } });
  });
});

describe("getBatchPlan (calendar-aware batching)", () => {
  it("produces separate groups per university and window date instead of one national batch", async () => {
    const { getBatchPlan } = await import("@/lib/readiness");
    const plan = await getBatchPlan(JAN);
    expect(plan.groups.map((g) => g.universityName)).toEqual([
      "Ahmadu Bello University, Zaria", "Federal University of Technology, Minna", "Delta State University, Abraka", "Rivers State University",
    ]);
    expect(plan.groups.map((g) => g.windowOpensAt.toISOString().slice(0, 10))).toEqual(["2025-09-22", "2025-10-27", "2025-11-17", "2025-12-29"]);
    expect(plan.groups.map((g) => g.beneficiaryIds.length)).toEqual([1, 2, 1, 1]);
    expect(plan.totalAmount).toBe(5 * 150_000);
  });
});

describe("readiness in overviews", () => {
  it("universities overview reports payment-ready students", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const rows = await getUniversitiesOverview(JAN);
    expect(Object.fromEntries(rows.map((r) => [r.shortName, r.readyCount]))).toMatchObject({ ABU: 1, DELSU: 1, RSU: 1, FUTMINNA: 2, UNIJOS: 0 });
  });

  it("dashboard readiness chart is driven by the rules engine", async () => {
    const { getDashboardData } = await import("@/lib/metrics");
    const data = await getDashboardData(JAN);
    const abu = data.readiness.find((r) => r.university === "ABU")!;
    expect(abu.ready).toBe(1);
    const unijos = data.readiness.find((r) => r.university === "UNIJOS")!;
    expect(unijos.ready).toBe(0);
    expect(unijos.waiting + unijos.blocked).toBeGreaterThan(0);
    expect(data.kpis.paymentReady).toBe(5);
  });

  it("beneficiary list can be filtered by readiness category", async () => {
    const { getReadinessMap } = await import("@/lib/readiness");
    const { listBeneficiariesPage } = await import("@/lib/beneficiaries");
    const map = await getReadinessMap(JAN);
    const ids = [...map.entries()].filter(([, r]) => r.category.key === "READY").map(([id]) => id);
    const page = await listBeneficiariesPage({ ids }, 1, 20);
    expect(page.pagination.total).toBe(5);
  });
});
