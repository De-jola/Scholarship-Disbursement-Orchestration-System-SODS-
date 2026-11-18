import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { EVENT_TYPES, validateForApproval, type EventType, type ParsedEvent, type SourceType } from "@/lib/calendar-parser";
import type { Session } from "@/lib/session";

type Actor = Pick<Session, "userId" | "name" | "role">;

export async function createCalendarFromUpload(
  actor: Actor,
  input: { universityId: string; session: string; sourceType: SourceType; sourceName: string; events: ParsedEvent[] },
) {
  const cal = await db.academicCalendar.create({
    data: {
      universityId: input.universityId,
      session: input.session,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      reviewStatus: "PENDING_REVIEW",
      events: { create: input.events.map((e) => ({ ...e })) },
    },
  });
  await logAudit(actor, "CALENDAR_UPLOADED", "AcademicCalendar",
    `Uploaded ${input.sourceName} for ${input.session} (${input.events.length} events extracted; awaiting administrator review)`,
    { entityId: cal.id, universityId: input.universityId });
  return cal;
}

export async function addManualEvent(
  actor: Actor,
  input: { universityId: string; session: string; eventType: EventType; title: string; startDate: Date; endDate: Date },
) {
  if (input.endDate < input.startDate) throw new Error("The end date cannot be before the start date.");
  const existing = await db.academicCalendar.findMany({
    where: { universityId: input.universityId, session: input.session, reviewStatus: { in: ["DRAFT", "PENDING_REVIEW", "APPROVED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing.some((c) => c.reviewStatus === "APPROVED")) {
    throw new Error("This session already has an approved calendar, which is locked. Upload a revised calendar for review instead.");
  }
  let cal = existing.find((c) => c.reviewStatus === "DRAFT") ?? existing[0];
  if (!cal) {
    cal = await db.academicCalendar.create({
      data: { universityId: input.universityId, session: input.session, sourceType: "MANUAL_ENTRY", sourceName: "Manual entry by Scholarship Administrator", reviewStatus: "DRAFT" },
    });
  }
  await db.calendarEvent.create({
    data: {
      academicCalendarId: cal.id, eventType: input.eventType, title: input.title,
      startDate: input.startDate, endDate: input.endDate, confidence: 1, sourceText: "Entered manually",
    },
  });
  await logAudit(actor, "CALENDAR_EVENT_ADDED", "AcademicCalendar",
    `Added manual event "${input.title}" (${input.eventType.toLowerCase().replace("_", " ")}) to the ${input.session} calendar`,
    { entityId: cal.id, universityId: input.universityId });
  return cal;
}

export async function submitForReview(actor: Actor, calendarId: string) {
  const cal = await db.academicCalendar.findUniqueOrThrow({ where: { id: calendarId } });
  if (cal.reviewStatus !== "DRAFT") throw new Error("Only draft calendars can be submitted for review.");
  const updated = await db.academicCalendar.update({ where: { id: calendarId }, data: { reviewStatus: "PENDING_REVIEW" } });
  await logAudit(actor, "CALENDAR_UPLOADED", "AcademicCalendar", `Submitted the ${cal.session} draft calendar for review`,
    { entityId: cal.id, universityId: cal.universityId });
  return updated;
}

export async function approveCalendar(actor: Actor, calendarId: string) {
  const cal = await db.academicCalendar.findUniqueOrThrow({ where: { id: calendarId }, include: { events: true, university: true } });
  if (cal.reviewStatus !== "PENDING_REVIEW" && cal.reviewStatus !== "DRAFT") {
    throw new Error(`A ${cal.reviewStatus.toLowerCase()} calendar cannot be approved.`);
  }
  const problem = validateForApproval(cal.events);
  if (problem) throw new Error(problem);

  await db.$transaction([
    // A revised calendar supersedes any previously approved calendar for the same session.
    db.academicCalendar.updateMany({
      where: { universityId: cal.universityId, session: cal.session, reviewStatus: "APPROVED", id: { not: cal.id } },
      data: { reviewStatus: "REJECTED", reviewNotes: `Superseded by revised calendar ${cal.sourceName}` },
    }),
    db.academicCalendar.update({
      where: { id: cal.id },
      data: { reviewStatus: "APPROVED", approvedByUserId: actor.userId, approvedByName: actor.name, approvedAt: new Date(), reviewNotes: null },
    }),
  ]);
  await logAudit(actor, "CALENDAR_APPROVED", "AcademicCalendar",
    `Approved ${cal.session} calendar for ${cal.university.name}; payment batching is now enabled for this university`,
    { entityId: cal.id, universityId: cal.universityId });
}

export async function rejectCalendar(actor: Actor, calendarId: string, reason: string) {
  if (!reason.trim()) throw new Error("A reason is required to reject a calendar.");
  const cal = await db.academicCalendar.findUniqueOrThrow({ where: { id: calendarId }, include: { university: true } });
  if (cal.reviewStatus !== "PENDING_REVIEW" && cal.reviewStatus !== "DRAFT") {
    throw new Error(`A ${cal.reviewStatus.toLowerCase()} calendar cannot be rejected.`);
  }
  await db.academicCalendar.update({ where: { id: calendarId }, data: { reviewStatus: "REJECTED", reviewNotes: reason.trim() } });
  await logAudit(actor, "CALENDAR_REJECTED", "AcademicCalendar",
    `Rejected ${cal.session} calendar for ${cal.university.name}: ${reason.trim()}`,
    { entityId: cal.id, universityId: cal.universityId });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function loadEditableEvent(eventId: string) {
  const ev = await db.calendarEvent.findUniqueOrThrow({ where: { id: eventId }, include: { calendar: { include: { university: true } } } });
  const status = ev.calendar.reviewStatus;
  if (status === "APPROVED") throw new Error("This calendar is approved and locked. Upload a revised calendar for review to change its dates.");
  if (status === "REJECTED") throw new Error("A rejected calendar cannot be edited. Upload a new calendar instead.");
  return ev;
}

/** Reviewer corrects an AI-extracted event in place. The first extraction is preserved for audit. */
export async function correctCalendarEvent(
  actor: Actor,
  eventId: string,
  input: { title: string; eventType: EventType; startDate: Date; endDate: Date },
) {
  const ev = await loadEditableEvent(eventId);
  const title = input.title.trim();
  if (!title) throw new Error("Enter an event title.");
  if (!(EVENT_TYPES as readonly string[]).includes(input.eventType)) throw new Error("Select a valid event type.");
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) throw new Error("Enter valid start and end dates.");
  if (input.endDate < input.startDate) throw new Error("The end date cannot be before the start date.");
  const unchanged = title === ev.title && input.eventType === ev.eventType
    && input.startDate.getTime() === ev.startDate.getTime() && input.endDate.getTime() === ev.endDate.getTime();
  if (unchanged) throw new Error("No changes to save. Edit a date, title or type first.");

  const originalValue = ev.originalValue ?? JSON.stringify({
    eventType: ev.eventType, title: ev.title, startDate: ev.startDate.toISOString(), endDate: ev.endDate.toISOString(),
    confidence: ev.confidence, sourceText: ev.sourceText,
  });
  await db.calendarEvent.update({
    where: { id: eventId },
    data: {
      title, eventType: input.eventType, startDate: input.startDate, endDate: input.endDate,
      confidence: 1, correctedByName: actor.name, correctedAt: new Date(), originalValue,
    },
  });
  const cal = ev.calendar;
  const titleNote = title !== ev.title ? `; title "${ev.title}" → "${title}"` : "";
  await logAudit(actor, "CALENDAR_EVENT_CORRECTED", "AcademicCalendar",
    `Corrected "${title}" in the ${cal.session} calendar for ${cal.university.name}: ${iso(ev.startDate)} – ${iso(ev.endDate)} → ${iso(input.startDate)} – ${iso(input.endDate)}${titleNote}`,
    { entityId: cal.id, universityId: cal.universityId });
}

/** Reviewer removes an event the extraction invented or duplicated. */
export async function removeCalendarEvent(actor: Actor, eventId: string) {
  const ev = await loadEditableEvent(eventId);
  await db.calendarEvent.delete({ where: { id: eventId } });
  await logAudit(actor, "CALENDAR_EVENT_REMOVED", "AcademicCalendar",
    `Removed extracted event "${ev.title}" (${iso(ev.startDate)} – ${iso(ev.endDate)}) from the ${ev.calendar.session} calendar for ${ev.calendar.university.name}`,
    { entityId: ev.calendar.id, universityId: ev.calendar.universityId });
}
