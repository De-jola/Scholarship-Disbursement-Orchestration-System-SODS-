"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { addManualEventAction, uploadCalendarAction } from "@/app/actions/calendars";
import { EVENT_TYPES } from "@/lib/calendar-parser";
import { humanize } from "@/lib/format";
import type { UniversityRow } from "@/lib/universities";

interface Props {
  open: boolean;
  university: UniversityRow | null;
  onClose: () => void;
}

export function UploadCalendarModal({ open, university, onClose }: Props) {
  const { run, pending } = useAction();
  if (!university) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Upload calendar: ${university.name}`}
      description="Upload a CSV, JSON, text-based PDF or TXT file. Its content is read locally to extract events for your review. Nothing is fetched from the university website or sent to an external service."
    >
      <form
        id="upload-calendar"
        action={(fd) => run(() => uploadCalendarAction(fd), (r) => r.ok && onClose())}
        className="space-y-4"
      >
        <input type="hidden" name="universityId" value={university.id} />
        <div>
          <label htmlFor="upload-session" className="label">Academic session</label>
          <input id="upload-session" name="session" className="field" defaultValue={university.currentSession} placeholder="2025/2026" required pattern="\d{4}/\d{4}" />
        </div>
        <div>
          <label htmlFor="upload-file" className="label">Calendar file</label>
          <input id="upload-file" name="file" type="file" accept=".csv,.json,.pdf,.txt" className="field" required />
          <p className="mt-1 text-xs text-slate-500">
            CSV/JSON columns: eventType, title, startDate, endDate, sourceText (optional). PDF/TXT: lines such as "Course registration: 9th - 27th November 2026" are recognised. Scanned image PDFs cannot be read because OCR is not enabled.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Extracting events from the file…" : "Upload and extract events"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ManualEventModal({ open, university, onClose }: Props) {
  const { run, pending } = useAction();
  if (!university) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Add calendar event: ${university.name}`} description="Events are added to a draft calendar for the session, which must then be submitted for review.">
      <form action={(fd) => run(() => addManualEventAction(fd), (r) => r.ok && onClose())} className="space-y-4">
        <input type="hidden" name="universityId" value={university.id} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="m-session" className="label">Session</label>
            <input id="m-session" name="session" className="field" defaultValue={university.currentSession} required />
          </div>
          <div>
            <label htmlFor="m-type" className="label">Event type</label>
            <select id="m-type" name="eventType" className="field" required defaultValue="REGISTRATION">
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="m-title" className="label">Title</label>
          <input id="m-title" name="title" className="field" required placeholder="e.g. Course registration" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="m-start" className="label">Start date</label>
            <input id="m-start" name="startDate" type="date" className="field" required />
          </div>
          <div>
            <label htmlFor="m-end" className="label">End date</label>
            <input id="m-end" name="endDate" type="date" className="field" required />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Saving event…" : "Add event"}</Button>
        </div>
      </form>
    </Modal>
  );
}
