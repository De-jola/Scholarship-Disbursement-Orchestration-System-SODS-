import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const admin = { userId: "u1", name: "Adaeze Okonkwo", role: "ADMIN" as const, email: "x" };

beforeAll(async () => {
  prisma = await createSeededDb("calendar");
}, 120_000);
afterAll(async () => prisma.$disconnect());

async function uni(short: string) {
  return prisma.university.findFirstOrThrow({ where: { shortName: short } });
}

const events = [
  { eventType: "REGISTRATION" as const, title: "Reg", startDate: new Date("2026-02-02"), endDate: new Date("2026-02-20"), confidence: 0.9, sourceText: "Reg" },
  { eventType: "SESSION_END" as const, title: "End", startDate: new Date("2026-09-01"), endDate: new Date("2026-09-01"), confidence: 0.9, sourceText: "End" },
];

describe("calendar service", () => {
  it("creates an uploaded calendar in PENDING_REVIEW and writes an audit entry", async () => {
    const { createCalendarFromUpload } = await import("@/lib/calendar-service");
    const u = await uni("SVU");
    const cal = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "svu.csv", events });
    expect(cal.reviewStatus).toBe("PENDING_REVIEW");
    const log = await prisma.auditLog.findFirst({ where: { action: "CALENDAR_UPLOADED", universityId: u.id } });
    expect(log?.details).toContain("svu.csv");
  });

  it("refuses to approve a calendar without a registration event", async () => {
    const { createCalendarFromUpload, approveCalendar } = await import("@/lib/calendar-service");
    const u = await uni("UUS");
    const cal = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "uus.csv", events: [events[1]] });
    await expect(approveCalendar(admin, cal.id)).rejects.toThrow(/registration/i);
  });

  it("approves a valid calendar, recording approver and timestamp, and audits it", async () => {
    const { approveCalendar } = await import("@/lib/calendar-service");
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { university: { shortName: "HSU" }, reviewStatus: "PENDING_REVIEW" } });
    await approveCalendar(admin, cal.id);
    const after = await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } });
    expect(after.reviewStatus).toBe("APPROVED");
    expect(after.approvedByName).toBe("Adaeze Okonkwo");
    expect(after.approvedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "CALENDAR_APPROVED", universityId: after.universityId } })).toBeGreaterThanOrEqual(1);
  });

  it("requires a reason to reject and leaves the calendar rejected", async () => {
    const { rejectCalendar } = await import("@/lib/calendar-service");
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { university: { shortName: "SVU" }, reviewStatus: "PENDING_REVIEW" } });
    await expect(rejectCalendar(admin, cal.id, "  ")).rejects.toThrow(/reason/i);
    await rejectCalendar(admin, cal.id, "Dates conflict with Senate notice");
    const after = await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } });
    expect(after.reviewStatus).toBe("REJECTED");
    expect(after.reviewNotes).toContain("Senate");
  });

  it("locks approved calendars against manual edits", async () => {
    const { addManualEvent } = await import("@/lib/calendar-service");
    const u = await uni("NSU");
    await expect(
      addManualEvent(admin, { universityId: u.id, session: "2025/2026", eventType: "BREAK", title: "Mid-session break", startDate: new Date("2026-04-01"), endDate: new Date("2026-04-10") }),
    ).rejects.toThrow(/approved/i);
  });

  it("creates a draft manual calendar on first manual event, and submit moves it to review", async () => {
    const { addManualEvent, submitForReview } = await import("@/lib/calendar-service");
    const u = await uni("LCU");
    const cal = await addManualEvent(admin, { universityId: u.id, session: "2025/2026", eventType: "REGISTRATION", title: "Registration", startDate: new Date("2026-02-09"), endDate: new Date("2026-02-27") });
    expect(cal.reviewStatus).toBe("DRAFT");
    expect(cal.sourceType).toBe("MANUAL_ENTRY");
    await submitForReview(admin, cal.id);
    expect((await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } })).reviewStatus).toBe("PENDING_REVIEW");
  });

  it("supersedes a previously approved calendar for the same session when a revised one is approved", async () => {
    const { createCalendarFromUpload, approveCalendar } = await import("@/lib/calendar-service");
    const u = await uni("DPU");
    const revised = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "dpu-v2.csv", events });
    await approveCalendar(admin, revised.id);
    const approved = await prisma.academicCalendar.findMany({ where: { universityId: u.id, session: "2025/2026", reviewStatus: "APPROVED" } });
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(revised.id);
  });
});
