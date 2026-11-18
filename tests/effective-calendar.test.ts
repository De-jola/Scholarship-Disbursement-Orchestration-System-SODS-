import { describe, expect, it } from "vitest";
import { selectEffectiveCalendar, type CalendarCandidate } from "@/lib/effective-calendar";

const d = (s: string) => new Date(`${s}T09:00:00.000Z`);
let n = 0;

function cal(session: string, reviewStatus: string, reg: [string, string] | null = ["2025-10-06", "2025-10-31"], end: string | null = null): CalendarCandidate {
  n++;
  const events = [] as CalendarCandidate["events"];
  if (reg) events.push({ eventType: "REGISTRATION", startDate: d(reg[0]), endDate: d(reg[1]) });
  if (end) events.push({ eventType: "SESSION_END", startDate: d(end), endDate: d(end) });
  return { id: `c${n}`, session, reviewStatus, createdAt: new Date(2025, 0, n), events };
}

const NOW = d("2026-01-12");
const day = (x: Date | null) => x?.toISOString().slice(0, 10);

describe("selectEffectiveCalendar", () => {
  it("is MISSING when there are no calendars", () => {
    const r = selectEffectiveCalendar([], NOW);
    expect(r.status).toBe("MISSING");
    expect(r.calendar).toBeNull();
    expect(r.session).toBeNull();
    expect(r.windowOpensAt).toBeNull();
  });

  it("uses an approved calendar and derives the payment window 14 days before registration", () => {
    const r = selectEffectiveCalendar([cal("2025/2026", "APPROVED", ["2025-10-06", "2025-10-31"], "2026-07-31")], NOW);
    expect(r.status).toBe("APPROVED");
    expect(r.session).toBe("2025/2026");
    expect(day(r.windowOpensAt)).toBe("2025-09-22");
  });

  it("switches to a newer session as soon as that calendar is approved", () => {
    const r = selectEffectiveCalendar(
      [cal("2025/2026", "APPROVED", ["2025-10-06", "2025-10-31"], "2026-07-31"), cal("2026/2027", "APPROVED", ["2026-11-03", "2026-11-21"], "2027-07-31")],
      NOW,
    );
    expect(r.session).toBe("2026/2027");
    expect(r.status).toBe("APPROVED");
    expect(day(r.windowOpensAt)).toBe("2026-10-20");
  });

  it("picks the latest session regardless of upload order", () => {
    const newer = cal("2026/2027", "APPROVED", ["2026-11-03", "2026-11-21"]);
    const older = cal("2025/2026", "APPROVED");
    expect(selectEffectiveCalendar([newer, older], NOW).session).toBe("2026/2027");
    expect(selectEffectiveCalendar([older, newer], NOW).session).toBe("2026/2027");
  });

  it("does not let a pending newer calendar override the approved one, but reports it", () => {
    const r = selectEffectiveCalendar([cal("2025/2026", "APPROVED", ["2025-10-06", "2025-10-31"], "2026-07-31"), cal("2026/2027", "PENDING_REVIEW", ["2026-11-03", "2026-11-21"])], NOW);
    expect(r.status).toBe("APPROVED");
    expect(r.session).toBe("2025/2026");
    expect(r.pendingSession).toBe("2026/2027");
  });

  it("is EXPIRED when the approved calendar's session has ended, with no payment window", () => {
    const r = selectEffectiveCalendar([cal("2024/2025", "APPROVED", ["2024-10-07", "2024-10-25"], "2025-07-25")], NOW);
    expect(r.status).toBe("EXPIRED");
    expect(r.calendar?.session).toBe("2024/2025");
    expect(r.windowOpensAt).toBeNull();
  });

  it("shows a later pending calendar instead of EXPIRED so the reviewer sees what to action", () => {
    const r = selectEffectiveCalendar([cal("2024/2025", "APPROVED", ["2024-10-07", "2024-10-25"], "2025-07-25"), cal("2025/2026", "PENDING_REVIEW")], NOW);
    expect(r.status).toBe("PENDING_REVIEW");
    expect(r.session).toBe("2025/2026");
  });

  it("moves from EXPIRED to APPROVED when a later session is approved", () => {
    const r = selectEffectiveCalendar([cal("2024/2025", "APPROVED", ["2024-10-07", "2024-10-25"], "2025-07-25"), cal("2025/2026", "APPROVED", ["2025-10-06", "2025-10-31"], "2026-07-31")], NOW);
    expect(r.status).toBe("APPROVED");
    expect(r.session).toBe("2025/2026");
  });

  it("never expires an approved calendar that has no session-end event", () => {
    expect(selectEffectiveCalendar([cal("2020/2021", "APPROVED", ["2020-10-05", "2020-10-30"], null)], NOW).status).toBe("APPROVED");
  });

  it("without any approved calendar, uses the latest non-rejected one", () => {
    expect(selectEffectiveCalendar([cal("2025/2026", "DRAFT")], NOW).status).toBe("DRAFT");
    expect(selectEffectiveCalendar([cal("2025/2026", "REJECTED")], NOW).status).toBe("REJECTED");
    const r = selectEffectiveCalendar([cal("2025/2026", "REJECTED"), cal("2025/2026", "PENDING_REVIEW")], NOW);
    expect(r.status).toBe("PENDING_REVIEW");
  });

  it("an approved calendar with no registration event has no window", () => {
    const r = selectEffectiveCalendar([cal("2025/2026", "APPROVED", null)], NOW);
    expect(r.status).toBe("APPROVED");
    expect(r.windowOpensAt).toBeNull();
  });
});
