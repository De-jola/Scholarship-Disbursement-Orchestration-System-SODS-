"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { correctCalendarEventAction } from "@/app/actions/calendars";
import { EVENT_TYPES } from "@/lib/calendar-parser";
import { formatDate, formatPercent, humanize } from "@/lib/format";
import type { CalendarView } from "@/lib/universities";

type EventView = CalendarView["events"][number];
const day = (iso: string) => iso.slice(0, 10);

/** Lets a reviewer fix a wrongly extracted event in place instead of rejecting and re-uploading the calendar. */
export function EventEditModal({ event, onClose }: { event: EventView | null; onClose: () => void }) {
  const { run, pending } = useAction();
  if (!event) return null;
  const src = event.original ?? event;

  return (
    <Modal
      open
      onClose={onClose}
      title="Correct extracted event"
      description="Compare against the source document, then fix any value the AI extracted incorrectly. The original extraction is kept in the audit trail."
    >
      <div className="mb-4 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-800">AI extraction{event.original ? " (original)" : ""}</p>
        <p className="mt-1">{src.title} · {humanize(src.eventType)} · {formatDate(src.startDate)} – {formatDate(src.endDate)} · {formatPercent(src.confidence)} confidence</p>
        <p className="mt-1 text-slate-500">Source text: “{event.sourceText}”</p>
      </div>

      <form
        action={(fd) => run(() => correctCalendarEventAction(fd), (r) => r.ok && onClose())}
        className="space-y-4"
      >
        <input type="hidden" name="eventId" value={event.id} />
        <div>
          <label htmlFor="ce-title" className="label">Title</label>
          <input id="ce-title" name="title" className="field" defaultValue={event.title} required />
        </div>
        <div>
          <label htmlFor="ce-type" className="label">Event type</label>
          <select id="ce-type" name="eventType" className="field" defaultValue={event.eventType}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ce-start" className="label">Start date</label>
            <input id="ce-start" name="startDate" type="date" className="field" defaultValue={day(event.startDate)} required />
          </div>
          <div>
            <label htmlFor="ce-end" className="label">End date</label>
            <input id="ce-end" name="endDate" type="date" className="field" defaultValue={day(event.endDate)} required />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="success" disabled={pending}>{pending ? "Saving correction…" : "Save correction"}</Button>
        </div>
      </form>
    </Modal>
  );
}
