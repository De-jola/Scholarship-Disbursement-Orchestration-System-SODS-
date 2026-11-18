import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const admin = { userId: "u1", name: "Adaeze Okonkwo", role: "ADMIN" as const, email: "x" };

beforeAll(async () => {
  prisma = await createSeededDb("directory");
}, 120_000);
afterAll(async () => prisma.$disconnect());

describe("real institution directory seed", () => {
  it("imports all 312 universities, with exactly 8 active programme partners", async () => {
    expect(await prisma.university.count()).toBe(312);
    expect(await prisma.university.count({ where: { status: "ACTIVE" } })).toBe(8);
  });
  it("uses real institution names, states and websites for partners", async () => {
    const abu = await prisma.university.findFirstOrThrow({ where: { shortName: "ABU" } });
    expect(abu.name).toBe("Ahmadu Bello University, Zaria");
    expect(abu.state).toBe("Kaduna");
    expect(abu.websiteUrl).toBe("https://www.abu.edu.ng");
    const names = (await prisma.university.findMany({ where: { status: "ACTIVE" } })).map((u) => u.name);
    expect(names).toContain("University of Lagos");
    expect(names).toContain("Rivers State University");
  });
  it("labels seeded calendars as illustrative", async () => {
    const cals = await prisma.academicCalendar.findMany();
    expect(cals.every((c) => /illustrative/i.test(c.sourceName))).toBe(true);
  });
});

describe("directory listing", () => {
  it("lists inactive institutions in pages, with search and filters", async () => {
    const { listDirectory } = await import("@/lib/directory");
    const p1 = await listDirectory({ page: 1, pageSize: 25 });
    expect(p1.rows).toHaveLength(25);
    expect(p1.pagination.total).toBe(304);
    expect(p1.pagination.totalPages).toBe(13);
    expect(p1.rows.every((r) => r.status === "INACTIVE")).toBe(true);

    const q = await listDirectory({ q: "ibadan", page: 1, pageSize: 25 });
    expect(q.rows.length).toBeGreaterThan(0);
    expect(q.rows.every((r) => /ibadan/i.test(r.name))).toBe(true);

    const state = await listDirectory({ state: "Lagos", page: 1, pageSize: 25 });
    expect(state.rows.every((r) => r.state === "Lagos")).toBe(true);
    const priv = await listDirectory({ category: "Private", page: 1, pageSize: 25 });
    expect(priv.pagination.total).toBeGreaterThan(100);
  });
  it("clamps an out-of-range page", async () => {
    const { listDirectory } = await import("@/lib/directory");
    expect((await listDirectory({ page: 999, pageSize: 25 })).pagination.page).toBe(13);
  });
});

describe("activating a partner", () => {
  it("activates an institution and audits it; repeat activation is refused", async () => {
    const { activatePartner } = await import("@/lib/directory");
    const target = await prisma.university.findFirstOrThrow({ where: { status: "INACTIVE" } });
    await activatePartner(admin, target.id);
    expect((await prisma.university.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { action: "UNIVERSITY_ACTIVATED", universityId: target.id } })).toBe(1);
    await expect(activatePartner(admin, target.id)).rejects.toThrow(/already/i);
  });
  it("newly activated partners appear in the partner overview with a missing calendar", async () => {
    const { getUniversitiesOverview } = await import("@/lib/universities");
    const rows = await getUniversitiesOverview(new Date("2026-01-12T09:00:00Z"));
    expect(rows).toHaveLength(9);
    expect(rows.filter((r) => r.calendarStatus === "MISSING").length).toBeGreaterThanOrEqual(2);
  });
});

describe("inactive universities stay out of programme reporting", () => {
  it("dashboard alerts only cover active partners", async () => {
    const { getDashboardData } = await import("@/lib/metrics");
    const missing = (await getDashboardData(new Date("2026-01-12T09:00:00Z"))).alerts.filter((a) => a.kind === "MISSING_CALENDAR");
    expect(missing.length).toBeLessThanOrEqual(4);
  });
});
