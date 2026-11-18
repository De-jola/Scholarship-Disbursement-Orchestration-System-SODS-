import { describe, expect, it } from "vitest";
import { extractCalendar } from "@/lib/calendar-extract";
import { makePdf } from "./helpers/make-pdf";

const day = (d: Date) => d.toISOString().slice(0, 10);
const bytes = (s: string) => new TextEncoder().encode(s);

const LINES_A = [
  "UNIVERSITY OF EXAMPLE 2026/2027 ACADEMIC CALENDAR",
  "Resumption of returning students: Monday 2nd November, 2026",
  "Course registration: 9th - 27th November 2026",
  "First semester lectures commence 16 November 2026 and end on 12 March 2027",
  "First semester examinations: 22nd March - 16th April 2027",
  "End of session: 30th July 2027",
];

describe("extractCalendar reads the uploaded file's own content", () => {
  it("extracts events from a real PDF's text layer", async () => {
    const r = await extractCalendar("senate-calendar.pdf", makePdf(LINES_A), "2026/2027");
    expect(r.errors).toEqual([]);
    expect(r.events).toHaveLength(5);
    expect(r.sourceType).toBe("SIMULATED_PORTAL");
    const reg = r.events.find((e) => e.eventType === "REGISTRATION")!;
    expect([day(reg.startDate), day(reg.endDate)]).toEqual(["2026-11-09", "2026-11-27"]);
    expect(reg.sourceText).toBe("Course registration: 9th - 27th November 2026");
  });

  it("gives different results for different PDFs, so it is not a fixed template", async () => {
    const other = await extractCalendar("b.pdf", makePdf(["Registration: 1st - 18th December 2026", "End of session: 15 September 2027"]), "2026/2027");
    expect(other.events).toHaveLength(2);
    expect(day(other.events.find((e) => e.eventType === "REGISTRATION")!.startDate)).toBe("2026-12-01");
    const a = await extractCalendar("a.pdf", makePdf(LINES_A), "2026/2027");
    expect(day(a.events.find((e) => e.eventType === "REGISTRATION")!.startDate)).toBe("2026-11-09");
  });

  it("says so clearly when a PDF has no readable text (for example a scanned image)", async () => {
    const r = await extractCalendar("scan.pdf", new Uint8Array(5000).map((_, i) => (i * 7) % 256), "2026/2027");
    expect(r.events).toEqual([]);
    expect(r.errors[0]).toMatch(/could not be read|no text|scanned/i);
    const blank = await extractCalendar("blank.pdf", makePdf([]), "2026/2027");
    expect(blank.events).toEqual([]);
    expect(blank.errors[0]).toMatch(/scanned|no text/i);
  });

  it("says so when a PDF has text but no recognisable calendar events", async () => {
    const r = await extractCalendar("memo.pdf", makePdf(["Minutes of the Senate meeting", "Held on the fifth of December"]), "2026/2027");
    expect(r.events).toEqual([]);
    expect(r.errors[0]).toMatch(/No calendar events/i);
  });

  it("reads plain-text calendars the same way", async () => {
    const r = await extractCalendar("calendar.txt", bytes(LINES_A.join("\n")), "2026/2027");
    expect(r.events).toHaveLength(5);
  });

  it("still parses CSV and JSON, and rejects other types", async () => {
    const csv = await extractCalendar("c.csv", bytes("eventType,title,startDate,endDate\nREGISTRATION,Reg,2026-11-03,2026-11-21"), "2026/2027");
    expect(csv.events).toHaveLength(1);
    const json = await extractCalendar("c.json", bytes(JSON.stringify([{ eventType: "REGISTRATION", title: "Reg", startDate: "2026-11-03", endDate: "2026-11-21" }])), "2026/2027");
    expect(json.events).toHaveLength(1);
    expect((await extractCalendar("c.exe", bytes("x"), "2026/2027")).errors[0]).toMatch(/Unsupported/);
  });

  it("surfaces skipped lines as warnings while keeping the events it did find", async () => {
    const r = await extractCalendar("a.pdf", makePdf(["Registration: 9 - 27 November 2026", "Senate meeting: 5 December 2026"]), "2026/2027");
    expect(r.events).toHaveLength(1);
    expect(r.errors.join(" ")).toMatch(/Senate meeting/);
  });
});
