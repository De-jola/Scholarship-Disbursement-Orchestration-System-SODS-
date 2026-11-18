import { describe, expect, it } from "vitest";
import {
  parseCalendarFile,
  validateForApproval,
} from "@/lib/calendar-parser";

const CSV = [
  "eventType,title,startDate,endDate,sourceText",
  "RESUMPTION,Resumption of students,2025-09-22,2025-09-26,Resume 22 Sept",
  "REGISTRATION,Course registration,2025-10-06,2025-10-31,Registration 6-31 Oct",
  "SESSION_END,End of session,2026-07-31,2026-07-31,",
].join("\n");

describe("calendar parsing", () => {
  it("parses a well-formed CSV into structured events with high confidence", () => {
    const r = parseCalendarFile("cal.csv", CSV, "2025/2026");
    expect(r.errors).toEqual([]);
    expect(r.events).toHaveLength(3);
    expect(r.events[1]).toMatchObject({ eventType: "REGISTRATION", title: "Course registration" });
    expect(r.events[1].startDate.toISOString().slice(0, 10)).toBe("2025-10-06");
    expect(r.events[1].confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.sourceType).toBe("CSV_UPLOAD");
  });

  it("accepts dd/mm/yyyy dates", () => {
    const r = parseCalendarFile("cal.csv", "eventType,title,startDate,endDate\nREGISTRATION,Reg,06/10/2025,31/10/2025", "2025/2026");
    expect(r.events[0].startDate.toISOString().slice(0, 10)).toBe("2025-10-06");
    expect(r.events[0].endDate.toISOString().slice(0, 10)).toBe("2025-10-31");
  });

  it("infers the event type from the title with reduced confidence when the type is unrecognised", () => {
    const r = parseCalendarFile("cal.csv", "eventType,title,startDate,endDate\n,Online course registration opens,2025-12-01,2025-12-19", "2025/2026");
    expect(r.events[0].eventType).toBe("REGISTRATION");
    expect(r.events[0].confidence).toBeLessThan(0.8);
  });

  it("reports row-level errors for bad dates and end-before-start without throwing", () => {
    const r = parseCalendarFile(
      "cal.csv",
      "eventType,title,startDate,endDate\nREGISTRATION,Reg,not-a-date,2025-10-31\nLECTURES,Lectures,2025-11-10,2025-11-01",
      "2025/2026",
    );
    expect(r.events).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/row 2/i);
  });

  it("rejects CSV missing required columns", () => {
    const r = parseCalendarFile("cal.csv", "title,startDate\nReg,2025-10-06", "2025/2026");
    expect(r.events).toHaveLength(0);
    expect(r.errors[0]).toMatch(/eventType|endDate/);
  });

  it("parses JSON arrays and { events: [] } objects", () => {
    const body = [{ eventType: "REGISTRATION", title: "Reg", startDate: "2026-01-12", endDate: "2026-01-30" }];
    expect(parseCalendarFile("c.json", JSON.stringify(body), "2025/2026").events).toHaveLength(1);
    expect(parseCalendarFile("c.json", JSON.stringify({ events: body }), "2025/2026").events).toHaveLength(1);
    expect(parseCalendarFile("c.json", "{broken", "2025/2026").errors[0]).toMatch(/JSON/);
  });

  it("rejects unsupported file types", () => {
    expect(parseCalendarFile("cal.exe", "x", "2025/2026").errors[0]).toMatch(/Unsupported/);
  });
});

describe("approval validation", () => {
  const ev = (eventType: string) => ({ eventType, startDate: new Date("2025-10-06"), endDate: new Date("2025-10-31") });
  it("requires a registration event", () => {
    expect(validateForApproval([ev("LECTURES")])).toMatch(/registration/i);
    expect(validateForApproval([])).toMatch(/at least one/i);
  });
  it("passes when a registration event exists", () => {
    expect(validateForApproval([ev("REGISTRATION")])).toBeNull();
  });
});
