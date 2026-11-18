"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/session";
import { parseCalendarFile, EVENT_TYPES, type EventType } from "@/lib/calendar-parser";
import {
  addManualEvent, approveCalendar, correctCalendarEvent, createCalendarFromUpload, rejectCalendar, removeCalendarEvent, submitForReview,
} from "@/lib/calendar-service";
import type { ActionResult } from "@/components/ui/use-action";

const MAX_BYTES = 1_000_000;

function fail(e: unknown): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "The action failed. Please try again." };
}

export async function uploadCalendarAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireCan("calendar.manage");
    const universityId = String(formData.get("universityId") ?? "");
    const session = String(formData.get("session") ?? "").trim();
    const file = formData.get("file");
    if (!universityId) return { ok: false, message: "Select a university." };
    if (!/^\d{4}\/\d{4}$/.test(session)) return { ok: false, message: "Enter the academic session in the format 2025/2026." };
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV, JSON or PDF calendar file to upload." };
    if (file.size > MAX_BYTES) return { ok: false, message: "The file is larger than 1 MB. Upload a smaller calendar file." };

    // PDF content is never parsed: the simulated extractor returns a template for human review.
    const text = file.name.toLowerCase().endsWith(".pdf") ? "" : await file.text();
    const parsed = parseCalendarFile(file.name, text, session);
    if (parsed.errors.length && parsed.events.length === 0) return { ok: false, message: parsed.errors.slice(0, 3).join(" ") };

    await createCalendarFromUpload(actor, { universityId, session, sourceType: parsed.sourceType, sourceName: file.name, events: parsed.events });
    revalidatePath("/universities");
    const warn = parsed.errors.length ? ` ${parsed.errors.length} row(s) were skipped: ${parsed.errors[0]}` : "";
    return { ok: true, message: `Extracted ${parsed.events.length} calendar events. Review and approve the calendar before payments can be batched.${warn}` };
  } catch (e) {
    return fail(e);
  }
}

export async function addManualEventAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireCan("calendar.manage");
    const eventType = String(formData.get("eventType")) as EventType;
    const title = String(formData.get("title") ?? "").trim();
    const start = new Date(`${String(formData.get("startDate"))}T09:00:00.000Z`);
    const end = new Date(`${String(formData.get("endDate"))}T09:00:00.000Z`);
    if (!(EVENT_TYPES as readonly string[]).includes(eventType)) return { ok: false, message: "Select an event type." };
    if (!title) return { ok: false, message: "Enter an event title." };
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, message: "Enter valid start and end dates." };
    await addManualEvent(actor, {
      universityId: String(formData.get("universityId")), session: String(formData.get("session") ?? "2025/2026").trim(),
      eventType, title, startDate: start, endDate: end,
    });
    revalidatePath("/universities");
    return { ok: true, message: "Calendar event added to the draft calendar. Submit the calendar for review when it is complete." };
  } catch (e) {
    return fail(e);
  }
}

export async function submitCalendarAction(calendarId: string): Promise<ActionResult> {
  try {
    await submitForReview(await requireCan("calendar.manage"), calendarId);
    revalidatePath("/universities");
    return { ok: true, message: "Calendar submitted for administrator review." };
  } catch (e) {
    return fail(e);
  }
}

export async function approveCalendarAction(calendarId: string): Promise<ActionResult> {
  try {
    await approveCalendar(await requireCan("calendar.manage"), calendarId);
    revalidatePath("/universities");
    return { ok: true, message: "Calendar approved. Beneficiaries at this university can now enter payment batches." };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectCalendarAction(calendarId: string, reason: string): Promise<ActionResult> {
  try {
    await rejectCalendar(await requireCan("calendar.manage"), calendarId, reason);
    revalidatePath("/universities");
    return { ok: true, message: "Calendar rejected. The reason has been recorded in the audit log." };
  } catch (e) {
    return fail(e);
  }
}

export async function correctCalendarEventAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireCan("calendar.manage");
    const eventType = String(formData.get("eventType")) as EventType;
    await correctCalendarEvent(actor, String(formData.get("eventId") ?? ""), {
      title: String(formData.get("title") ?? ""),
      eventType,
      startDate: new Date(`${String(formData.get("startDate"))}T09:00:00.000Z`),
      endDate: new Date(`${String(formData.get("endDate"))}T09:00:00.000Z`),
    });
    revalidatePath("/universities");
    return { ok: true, message: "Event corrected. The original AI extraction is kept in the audit trail." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCalendarEventAction(eventId: string): Promise<ActionResult> {
  try {
    await removeCalendarEvent(await requireCan("calendar.manage"), eventId);
    revalidatePath("/universities");
    return { ok: true, message: "Event removed from the calendar." };
  } catch (e) {
    return fail(e);
  }
}
