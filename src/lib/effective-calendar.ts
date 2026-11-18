import { paymentWindow, type CalendarFacts } from "@/lib/rules";

export type CalendarState = "APPROVED" | "PENDING_REVIEW" | "DRAFT" | "REJECTED" | "MISSING" | "EXPIRED";

export interface CalendarCandidate extends CalendarFacts {
  id: string;
  session: string;
  createdAt: Date;
}

export interface EffectiveCalendar<T extends CalendarCandidate = CalendarCandidate> {
  status: CalendarState;
  calendar: T | null;
  /** Session the status and payment window refer to (null when there is no calendar). */
  session: string | null;
  /** When payments may start: 14 days before registration, only for an approved, unexpired calendar. */
  windowOpensAt: Date | null;
  /** A newer or revised calendar that is waiting for review, if any. */
  pendingSession: string | null;
}

const newestFirst = (a: CalendarCandidate, b: CalendarCandidate) =>
  b.session.localeCompare(a.session) || b.createdAt.getTime() - a.createdAt.getTime();

/**
 * Chooses the calendar that governs a university right now.
 *  - The approved calendar for the LATEST session wins, so approving next session's calendar moves the university on.
 *  - A pending or draft calendar never overrides an approved one; it is only reported as pendingSession.
 *  - An approved calendar whose session has ended is EXPIRED (no payment window) unless a later calendar exists.
 */
export function selectEffectiveCalendar<T extends CalendarCandidate>(calendars: T[], now: Date): EffectiveCalendar<T> {
  const approved = calendars.filter((c) => c.reviewStatus === "APPROVED").sort(newestFirst);
  const live = calendars.filter((c) => c.reviewStatus === "DRAFT" || c.reviewStatus === "PENDING_REVIEW").sort(newestFirst);
  const rejected = calendars.filter((c) => c.reviewStatus === "REJECTED").sort(newestFirst);

  const eff = approved[0];
  if (eff) {
    const end = eff.events.find((e) => e.eventType === "SESSION_END")?.endDate;
    const expired = !!end && end < now;
    if (!expired) {
      const pending = live[0] && live[0].session >= eff.session ? live[0].session : null;
      return { status: "APPROVED", calendar: eff, session: eff.session, windowOpensAt: paymentWindow(eff)?.opensAt ?? null, pendingSession: pending };
    }
    const later = live.find((c) => c.session > eff.session);
    if (later) return { status: later.reviewStatus as CalendarState, calendar: later, session: later.session, windowOpensAt: null, pendingSession: later.session };
    return { status: "EXPIRED", calendar: eff, session: eff.session, windowOpensAt: null, pendingSession: null };
  }

  const pick = live[0] ?? rejected[0];
  if (!pick) return { status: "MISSING", calendar: null, session: null, windowOpensAt: null, pendingSession: null };
  return { status: pick.reviewStatus as CalendarState, calendar: pick, session: pick.session, windowOpensAt: null, pendingSession: live[0]?.session ?? null };
}
