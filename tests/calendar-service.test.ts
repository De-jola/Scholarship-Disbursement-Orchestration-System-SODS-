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
    const u = await uni("BUK");
    const cal = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "svu.csv", events });
    expect(cal.reviewStatus).toBe("PENDING_REVIEW");
    const log = await prisma.auditLog.findFirst({ where: { action: "CALENDAR_UPLOADED", universityId: u.id } });
    expect(log?.details).toContain("svu.csv");
  });

  it("refuses to approve a calendar without a registration event", async () => {
    const { createCalendarFromUpload, approveCalendar } = await import("@/lib/calendar-service");
    const u = await uni("UNN");
    const cal = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "uus.csv", events: [events[1]] });
    await expect(approveCalendar(admin, cal.id)).rejects.toThrow(/registration/i);
  });

  it("approves a valid calendar, recording approver and timestamp, and audits it", async () => {
    const { approveCalendar } = await import("@/lib/calendar-service");
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { university: { shortName: "UNIJOS" }, reviewStatus: "PENDING_REVIEW" } });
    await approveCalendar(admin, cal.id);
    const after = await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } });
    expect(after.reviewStatus).toBe("APPROVED");
    expect(after.approvedByName).toBe("Adaeze Okonkwo");
    expect(after.approvedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "CALENDAR_APPROVED", universityId: after.universityId } })).toBeGreaterThanOrEqual(1);
  });

  it("requires a reason to reject and leaves the calendar rejected", async () => {
    const { rejectCalendar } = await import("@/lib/calendar-service");
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { university: { shortName: "BUK" }, reviewStatus: "PENDING_REVIEW" } });
    await expect(rejectCalendar(admin, cal.id, "  ")).rejects.toThrow(/reason/i);
    await rejectCalendar(admin, cal.id, "Dates conflict with Senate notice");
    const after = await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } });
    expect(after.reviewStatus).toBe("REJECTED");
    expect(after.reviewNotes).toContain("Senate");
  });

  it("locks approved calendars against manual edits", async () => {
    const { addManualEvent } = await import("@/lib/calendar-service");
    const u = await uni("ABU");
    await expect(
      addManualEvent(admin, { universityId: u.id, session: "2025/2026", eventType: "BREAK", title: "Mid-session break", startDate: new Date("2026-04-01"), endDate: new Date("2026-04-10") }),
    ).rejects.toThrow(/approved/i);
  });

  it("creates a draft manual calendar on first manual event, and submit moves it to review", async () => {
    const { addManualEvent, submitForReview } = await import("@/lib/calendar-service");
    const u = await uni("UNILAG");
    const cal = await addManualEvent(admin, { universityId: u.id, session: "2025/2026", eventType: "REGISTRATION", title: "Registration", startDate: new Date("2026-02-09"), endDate: new Date("2026-02-27") });
    expect(cal.reviewStatus).toBe("DRAFT");
    expect(cal.sourceType).toBe("MANUAL_ENTRY");
    await submitForReview(admin, cal.id);
    expect((await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id } })).reviewStatus).toBe("PENDING_REVIEW");
  });

  it("supersedes a previously approved calendar for the same session when a revised one is approved", async () => {
    const { createCalendarFromUpload, approveCalendar } = await import("@/lib/calendar-service");
    const u = await uni("DELSU");
    const revised = await createCalendarFromUpload(admin, { universityId: u.id, session: "2025/2026", sourceType: "CSV_UPLOAD", sourceName: "dpu-v2.csv", events });
    await approveCalendar(admin, revised.id);
    const approved = await prisma.academicCalendar.findMany({ where: { universityId: u.id, session: "2025/2026", reviewStatus: "APPROVED" } });
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(revised.id);
  });
});

describe("reviewer corrections to extracted calendar events", () => {
  async function pendingPdfCalendar(short: string) {
    const { createCalendarFromUpload } = await import("@/lib/calendar-service");
    const { simulatePdfExtraction } = await import("@/lib/calendar-parser");
    const u = await uni(short);
    return createCalendarFromUpload(admin, {
      universityId: u.id, session: "2026/2027", sourceType: "SIMULATED_PORTAL", sourceName: `${short.toLowerCase()}-2026-27.pdf`,
      events: simulatePdfExtraction("2026/2027"),
    });
  }
  const eventOf = (calendarId: string, type: string) => prisma.calendarEvent.findFirstOrThrow({ where: { academicCalendarId: calendarId, eventType: type as never } });
  const day = (d: Date) => d.toISOString().slice(0, 10);

  it("corrects dates and title in place, marks the event human-corrected and fully confident", async () => {
    const { correctCalendarEvent } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("UNN");
    const ev = await eventOf(cal.id, "REGISTRATION");
    await correctCalendarEvent(admin, ev.id, { title: "Course registration (corrected)", eventType: "REGISTRATION", startDate: new Date("2026-11-09T09:00:00Z"), endDate: new Date("2026-11-27T09:00:00Z") });
    const after = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(day(after.startDate)).toBe("2026-11-09");
    expect(day(after.endDate)).toBe("2026-11-27");
    expect(after.title).toBe("Course registration (corrected)");
    expect(after.confidence).toBe(1);
    expect(after.correctedByName).toBe("Adaeze Okonkwo");
    expect(after.correctedAt).not.toBeNull();
  });

  it("keeps the original AI extraction for audit, even after several corrections", async () => {
    const { correctCalendarEvent } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("BUK");
    const ev = await eventOf(cal.id, "LECTURES");
    const originalStart = day(ev.startDate);
    await correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "LECTURES", startDate: new Date("2026-11-16T09:00:00Z"), endDate: new Date("2027-03-12T09:00:00Z") });
    await correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "LECTURES", startDate: new Date("2026-11-17T09:00:00Z"), endDate: new Date("2027-03-12T09:00:00Z") });
    const orig = JSON.parse((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).originalValue!);
    expect(orig.startDate.slice(0, 10)).toBe(originalStart);
    expect(orig.confidence).toBe(ev.confidence);
    expect(orig.sourceText).toBe(ev.sourceText);
  });

  it("writes an audit entry showing the before and after values", async () => {
    const { correctCalendarEvent } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("UNILAG");
    const ev = await eventOf(cal.id, "EXAMINATION");
    await correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "EXAMINATION", startDate: new Date("2027-03-22T09:00:00Z"), endDate: new Date("2027-04-16T09:00:00Z") });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "CALENDAR_EVENT_CORRECTED", entityId: cal.id } });
    expect(log.details).toContain("2027-03-22");
    expect(log.details).toContain(day(ev.startDate));
  });

  it("rejects invalid corrections: end before start, bad type, and no-op edits", async () => {
    const { correctCalendarEvent } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("RSU");
    const ev = await eventOf(cal.id, "RESUMPTION");
    await expect(correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "RESUMPTION", startDate: new Date("2026-11-10T09:00:00Z"), endDate: new Date("2026-11-01T09:00:00Z") })).rejects.toThrow(/end date/i);
    await expect(correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "NOPE" as never, startDate: ev.startDate, endDate: ev.endDate })).rejects.toThrow(/event type/i);
    await expect(correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "RESUMPTION", startDate: ev.startDate, endDate: ev.endDate })).rejects.toThrow(/no changes/i);
    await expect(correctCalendarEvent(admin, ev.id, { title: "  ", eventType: "RESUMPTION", startDate: ev.startDate, endDate: ev.endDate })).rejects.toThrow(/title/i);
  });

  it("locks corrections once the calendar is approved", async () => {
    const { correctCalendarEvent, approveCalendar, removeCalendarEvent } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("FUTMINNA");
    const ev = await eventOf(cal.id, "REGISTRATION");
    await approveCalendar(admin, cal.id);
    await expect(correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "REGISTRATION", startDate: new Date("2026-11-10T09:00:00Z"), endDate: new Date("2026-11-20T09:00:00Z") })).rejects.toThrow(/approved|locked/i);
    await expect(removeCalendarEvent(admin, ev.id)).rejects.toThrow(/approved|locked/i);
  });

  it("approval uses the corrected dates, so the payment window follows the human correction", async () => {
    const { correctCalendarEvent, approveCalendar } = await import("@/lib/calendar-service");
    const { paymentWindow } = await import("@/lib/rules");
    const cal = await pendingPdfCalendar("DELSU");
    const ev = await eventOf(cal.id, "REGISTRATION");
    await correctCalendarEvent(admin, ev.id, { title: ev.title, eventType: "REGISTRATION", startDate: new Date("2026-12-01T09:00:00Z"), endDate: new Date("2026-12-18T09:00:00Z") });
    await approveCalendar(admin, cal.id);
    const approved = await prisma.academicCalendar.findUniqueOrThrow({ where: { id: cal.id }, include: { events: true } });
    expect(day(paymentWindow(approved)!.opensAt)).toBe("2026-11-17");
  });

  it("removes a wrongly extracted event, audits it, and blocks approval if registration is gone", async () => {
    const { removeCalendarEvent, approveCalendar } = await import("@/lib/calendar-service");
    const cal = await pendingPdfCalendar("UNIJOS");
    const ev = await eventOf(cal.id, "REGISTRATION");
    await removeCalendarEvent(admin, ev.id);
    expect(await prisma.calendarEvent.count({ where: { id: ev.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "CALENDAR_EVENT_REMOVED", entityId: cal.id } })).toBe(1);
    await expect(approveCalendar(admin, cal.id)).rejects.toThrow(/registration/i);
  });
});
