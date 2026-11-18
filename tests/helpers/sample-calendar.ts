import type { ParsedEvent } from "@/lib/calendar-parser";

/** Test fixture: a plausible set of extracted events for a session. Not used by the application. */
export function sampleCalendarEvents(session: string): ParsedEvent[] {
  const startYear = Number(session.slice(0, 4));
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day, 9));
  const rows: [ParsedEvent["eventType"], string, Date, Date, number][] = [
    ["RESUMPTION", "Resumption", d(startYear, 10, 20), d(startYear, 10, 24), 0.91],
    ["REGISTRATION", "Course registration", d(startYear, 11, 3), d(startYear, 11, 21), 0.88],
    ["LECTURES", "Lectures", d(startYear, 11, 10), d(startYear + 1, 3, 6), 0.84],
    ["EXAMINATION", "Examinations", d(startYear + 1, 3, 16), d(startYear + 1, 4, 10), 0.74],
    ["SESSION_END", "End of session", d(startYear + 1, 9, 30), d(startYear + 1, 9, 30), 0.66],
  ];
  return rows.map(([eventType, title, startDate, endDate, confidence]) => ({ eventType, title, startDate, endDate, confidence, sourceText: title }));
}
