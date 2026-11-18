import { describe, expect, it } from "vitest";
import { extractEventsFromText } from "@/lib/calendar-text";

const day = (d: Date) => d.toISOString().slice(0, 10);
const find = (r: ReturnType<typeof extractEventsFromText>, type: string) => r.events.find((e) => e.eventType === type);

const SAMPLE = [
  "UNIVERSITY OF EXAMPLE - 2026/2027 ACADEMIC CALENDAR",
  "Resumption of returning students: Monday 2nd November, 2026",
  "Course registration: 9th - 27th November 2026",
  "First semester lectures commence 16 November 2026 and end on 12 March 2027",
  "First semester examinations: 22nd March - 16th April 2027",
  "Mid-semester break: 4 - 8 January 2027",
  "End of session: 30th July 2027",
].join("\n");

describe("extractEventsFromText: reads the actual dates in the document", () => {
  it("extracts each event with the right type and dates from a realistic calendar", () => {
    const r = extractEventsFromText(SAMPLE, "2026/2027");
    expect(r.events).toHaveLength(6);
    const reg = find(r, "REGISTRATION")!;
    expect([day(reg.startDate), day(reg.endDate)]).toEqual(["2026-11-09", "2026-11-27"]);
    const lec = find(r, "LECTURES")!;
    expect([day(lec.startDate), day(lec.endDate)]).toEqual(["2026-11-16", "2027-03-12"]);
    const ex = find(r, "EXAMINATION")!;
    expect([day(ex.startDate), day(ex.endDate)]).toEqual(["2027-03-22", "2027-04-16"]);
    const brk = find(r, "BREAK")!;
    expect([day(brk.startDate), day(brk.endDate)]).toEqual(["2027-01-04", "2027-01-08"]);
    const res = find(r, "RESUMPTION")!;
    expect([day(res.startDate), day(res.endDate)]).toEqual(["2026-11-02", "2026-11-02"]);
    const end = find(r, "SESSION_END")!;
    expect(day(end.endDate)).toBe("2027-07-30");
  });

  it("is NOT static: different documents give different results", () => {
    const other = extractEventsFromText("Registration: 1st - 18th December 2026\nEnd of session: 15 September 2027", "2026/2027");
    expect(other.events).toHaveLength(2);
    expect(day(find(other, "REGISTRATION")!.startDate)).toBe("2026-12-01");
    expect(day(find(extractEventsFromText(SAMPLE, "2026/2027"), "REGISTRATION")!.startDate)).toBe("2026-11-09");
    expect(extractEventsFromText("nothing relevant here", "2026/2027").events).toEqual([]);
  });

  it("keeps the source line and a readable title for the reviewer", () => {
    const reg = find(extractEventsFromText(SAMPLE, "2026/2027"), "REGISTRATION")!;
    expect(reg.sourceText).toBe("Course registration: 9th - 27th November 2026");
    expect(reg.title).toBe("Course registration");
  });

  it.each([
    ["Registration: 3rd - 21st November 2026"],
    ["Registration: 3 Nov - 21 Nov 2026"],
    ["Registration: 3rd November to 21st November, 2026"],
    ["Registration: 03/11/2026 - 21/11/2026"],
    ["Registration: 2026-11-03 to 2026-11-21"],
    ["Registration: November 3 - 21, 2026"],
    ["Registration | 3 November 2026 | 21 November 2026"],
  ])("understands the date format in %s", (line) => {
    const reg = find(extractEventsFromText(line, "2026/2027"), "REGISTRATION")!;
    expect([day(reg.startDate), day(reg.endDate)]).toEqual(["2026-11-03", "2026-11-21"]);
  });

  it("infers a missing year from the session and flags lower confidence", () => {
    const r = extractEventsFromText("Registration: 9 - 27 November\nExaminations: 22 March - 16 April", "2026/2027");
    expect(day(find(r, "REGISTRATION")!.startDate)).toBe("2026-11-09");
    expect(day(find(r, "EXAMINATION")!.startDate)).toBe("2027-03-22");
    expect(find(r, "REGISTRATION")!.confidence).toBeLessThanOrEqual(0.8);
    const explicit = extractEventsFromText("Registration: 9 - 27 November 2026", "2026/2027");
    expect(find(explicit, "REGISTRATION")!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("handles a range that crosses the new year when the year is inferred", () => {
    const r = extractEventsFromText("Mid-semester break: 20 December - 10 January", "2026/2027");
    const b = find(r, "BREAK")!;
    expect([day(b.startDate), day(b.endDate)]).toEqual(["2026-12-20", "2027-01-10"]);
  });

  it("joins an event title with dates on the following line", () => {
    const r = extractEventsFromText("Course Registration\n9th - 27th November 2026", "2026/2027");
    expect(day(find(r, "REGISTRATION")!.startDate)).toBe("2026-11-09");
  });

  it("gives lower confidence when a single date is found for an event that normally spans dates", () => {
    const r = extractEventsFromText("Registration opens 9 November 2026", "2026/2027");
    expect(find(r, "REGISTRATION")!.confidence).toBeLessThan(0.8);
  });

  it("skips impossible dates and explains why, without crashing", () => {
    const r = extractEventsFromText("Registration: 31 November 2026 - 5 December 2026\nExaminations: 10 April 2027 - 1 April 2027", "2026/2027");
    expect(r.events).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("reports lines that contain dates but no recognisable event", () => {
    const r = extractEventsFromText("Registration: 9 - 27 November 2026\nSenate meeting: 5 December 2026", "2026/2027");
    expect(r.events).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/Senate meeting/);
  });

  it("removes exact duplicates", () => {
    const r = extractEventsFromText("Registration: 9 - 27 November 2026\nRegistration: 9 - 27 November 2026", "2026/2027");
    expect(r.events).toHaveLength(1);
  });
});
