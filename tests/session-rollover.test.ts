import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const admin = { userId: "u1", name: "Adaeze Okonkwo", role: "ADMIN" as const, email: "x" };
const JAN = new Date("2026-01-12T09:00:00.000Z");
const NOV26 = new Date("2026-11-02T09:00:00.000Z");
const day = (d: Date | null) => d?.toISOString().slice(0, 10);

beforeAll(async () => {
  prisma = await createSeededDb("rollover");
}, 120_000);
afterAll(async () => prisma.$disconnect());

async function uploadPdf(short: string, session: string) {
  const { createCalendarFromUpload } = await import("@/lib/calendar-service");
  const { simulatePdfExtraction } = await import("@/lib/calendar-parser");
  const u = await prisma.university.findFirstOrThrow({ where: { shortName: short } });
  return createCalendarFromUpload(admin, { universityId: u.id, session, sourceType: "SIMULATED_PORTAL", sourceName: `${short}.pdf`, events: simulatePdfExtraction(session) });
}

async function overviewOf(short: string, now = JAN) {
  const { getUniversitiesOverview } = await import("@/lib/universities");
  return (await getUniversitiesOverview(now)).find((r) => r.shortName === short)!;
}

describe("approving a calendar for a new session updates status and payment window", () => {
  it("a pending 2026/2027 calendar does not change the approved status or window", async () => {
    const before = await overviewOf("ABU");
    await uploadPdf("ABU", "2026/2027");
    const after = await overviewOf("ABU");
    expect(after.calendarStatus).toBe("APPROVED");
    expect(after.currentSession).toBe("2025/2026");
    expect(day(after.nextPaymentWindow)).toBe(day(before.nextPaymentWindow));
    expect(after.pendingSession).toBe("2026/2027");
  });

  it("approving it moves the university to 2026/2027 with the new payment window", async () => {
    const { approveCalendar } = await import("@/lib/calendar-service");
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { university: { shortName: "ABU" }, session: "2026/2027" } });
    await approveCalendar(admin, cal.id);
    const row = await overviewOf("ABU");
    expect(row.calendarStatus).toBe("APPROVED");
    expect(row.currentSession).toBe("2026/2027");
    // Simulated PDF registration opens 3 Nov 2026, so the window opens 14 days earlier.
    expect(day(row.nextPaymentWindow)).toBe("2026-10-20");
    expect(row.pendingSession).toBeNull();
  });

  it("readiness follows the new calendar: not open in January, open in November, re-eligible for the new session", async () => {
    const { getReadinessMap } = await import("@/lib/readiness");
    const abu = await prisma.beneficiary.findMany({ where: { university: { shortName: "ABU" }, verificationStatus: "VERIFIED" } });
    const jan = await getReadinessMap(JAN);
    expect(abu.every((b) => jan.get(b.id)!.category.key === "WINDOW_NOT_OPEN")).toBe(true);
    expect(day(jan.get(abu[0].id)!.windowOpensAt)).toBe("2026-10-20");

    const nov = await getReadinessMap(NOV26);
    // Beneficiaries paid or batched for 2025/2026 become eligible again for the new session.
    expect(abu.every((b) => nov.get(b.id)!.ready)).toBe(true);
  });

  it("an expired calendar stays expired and its beneficiaries are not payment-ready", async () => {
    const row = await overviewOf("UNILAG");
    expect(row.calendarStatus).toBe("EXPIRED");
    expect(row.nextPaymentWindow).toBeNull();
    const { getReadinessMap } = await import("@/lib/readiness");
    const map = await getReadinessMap(JAN);
    const verified = await prisma.beneficiary.findMany({ where: { university: { shortName: "UNILAG" }, verificationStatus: "VERIFIED" } });
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((b) => !map.get(b.id)!.ready && map.get(b.id)!.category.key === "AWAITING_CALENDAR")).toBe(true);
  });

  it("approving a current-session calendar for an expired university makes it approved again", async () => {
    const { approveCalendar } = await import("@/lib/calendar-service");
    const cal = await uploadPdf("UNILAG", "2025/2026");
    await approveCalendar(admin, cal.id);
    // Simulated PDF dates for 2025/2026 put the session end in Sept 2026, so it is current at Jan 2026.
    const row = await overviewOf("UNILAG");
    expect(row.calendarStatus).toBe("APPROVED");
    expect(row.currentSession).toBe("2025/2026");
    expect(row.nextPaymentWindow).not.toBeNull();
  });

  it("the beneficiary record and dashboard alerts use the university's effective calendar", async () => {
    const { getBeneficiaryDetail } = await import("@/lib/beneficiaries");
    const { getDashboardData } = await import("@/lib/metrics");
    const b = await prisma.beneficiary.findFirstOrThrow({ where: { university: { shortName: "ABU" } } });
    const detail = await getBeneficiaryDetail(b.id);
    expect(detail!.calendar?.session).toBe("2026/2027");
    const alerts = (await getDashboardData(JAN)).alerts;
    expect(alerts.some((a) => a.kind === "EXPIRED_CALENDAR" && /Ahmadu Bello/.test(a.title))).toBe(false);
    expect(alerts.some((a) => a.kind === "EXPIRED_CALENDAR" && /Lagos/.test(a.title))).toBe(false);
  });
});
