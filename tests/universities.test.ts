import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const NOW = new Date("2026-01-12T09:00:00.000Z");

beforeAll(async () => {
  prisma = await createSeededDb("universities");
}, 120_000);
afterAll(async () => prisma.$disconnect());

describe("universities overview", () => {
  it("derives calendar status per university", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const rows = await getUniversitiesOverview(NOW);
    const by = Object.fromEntries(rows.map((r) => [r.shortName, r]));
    expect(by.NSU.calendarStatus).toBe("APPROVED");
    expect(by.HSU.calendarStatus).toBe("PENDING_REVIEW");
    expect(by.SVU.calendarStatus).toBe("MISSING");
    expect(by.LCU.calendarStatus).toBe("EXPIRED");
  });

  it("reports the payment window as 14 days before registration opens", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const rows = await getUniversitiesOverview(NOW);
    const nsu = rows.find((r) => r.shortName === "NSU")!;
    expect(nsu.nextPaymentWindow?.toISOString().slice(0, 10)).toBe("2025-09-22");
    expect(rows.find((r) => r.shortName === "CUT")!.nextPaymentWindow?.toISOString().slice(0, 10)).toBe("2025-12-29");
    expect(rows.find((r) => r.shortName === "SVU")!.nextPaymentWindow).toBeNull();
  });

  it("counts beneficiaries and verified beneficiaries", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const nsu = (await getUniversitiesOverview(NOW)).find((r) => r.shortName === "NSU")!;
    expect(nsu.beneficiaryCount).toBe(6);
    expect(nsu.verifiedCount).toBe(5);
  });

  it("includes calendars with events for the review drawer, newest first", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const nsu = (await getUniversitiesOverview(NOW)).find((r) => r.shortName === "NSU")!;
    expect(nsu.calendars[0].events.length).toBeGreaterThan(0);
    expect(nsu.calendars[0].avgConfidence).toBeGreaterThan(0.8);
  });
});
