import { db } from "@/lib/db";
import { CURRENT_SESSION } from "@/lib/constants";
import { WINDOW_LEAD_DAYS } from "@/lib/rules";
import { getReadinessMap } from "@/lib/readiness";

export type CalendarState = "APPROVED" | "PENDING_REVIEW" | "DRAFT" | "REJECTED" | "MISSING" | "EXPIRED";

export interface CalendarView {
  id: string;
  session: string;
  sourceType: string;
  sourceName: string;
  reviewStatus: string;
  reviewNotes: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  avgConfidence: number;
  events: {
    id: string;
    eventType: string;
    title: string;
    startDate: string;
    endDate: string;
    confidence: number;
    sourceText: string;
  }[];
}

export async function getUniversitiesOverview(now: Date) {
  const readinessMap = await getReadinessMap(now);
  const unis = await db.university.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      calendars: { include: { events: { orderBy: { startDate: "asc" } } }, orderBy: { createdAt: "desc" } },
      beneficiaries: { select: { id: true, verificationStatus: true } },
    },
  });

  return unis.map((u) => {
    const current = u.calendars.filter((c) => c.session === CURRENT_SESSION);
    // Prefer the approved calendar, else the most recent one for the current session.
    const shown = current.find((c) => c.reviewStatus === "APPROVED") ?? current[0];

    let calendarStatus: CalendarState = "MISSING";
    if (shown) calendarStatus = shown.reviewStatus as CalendarState;
    else {
      const old = u.calendars.find((c) => c.reviewStatus === "APPROVED");
      const end = old?.events.find((e) => e.eventType === "SESSION_END")?.endDate;
      if (old && end && end < now) calendarStatus = "EXPIRED";
    }

    const reg = shown?.reviewStatus === "APPROVED" ? shown.events.find((e) => e.eventType === "REGISTRATION") : undefined;
    const nextPaymentWindow = reg ? new Date(reg.startDate.getTime() - WINDOW_LEAD_DAYS * 86_400_000) : null;

    const calendars: CalendarView[] = u.calendars.map((c) => ({
      id: c.id,
      session: c.session,
      sourceType: c.sourceType,
      sourceName: c.sourceName,
      reviewStatus: c.reviewStatus,
      reviewNotes: c.reviewNotes,
      approvedByName: c.approvedByName,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      avgConfidence: c.events.length ? c.events.reduce((s, e) => s + e.confidence, 0) / c.events.length : 0,
      events: c.events.map((e) => ({
        id: e.id, eventType: e.eventType, title: e.title,
        startDate: e.startDate.toISOString(), endDate: e.endDate.toISOString(),
        confidence: e.confidence, sourceText: e.sourceText,
      })),
    }));

    return {
      id: u.id,
      name: u.name,
      shortName: u.shortName,
      state: u.state,
      calendarStatus,
      currentSession: CURRENT_SESSION,
      beneficiaryCount: u.beneficiaries.length,
      verifiedCount: u.beneficiaries.filter((b) => b.verificationStatus === "VERIFIED").length,
      readyCount: u.beneficiaries.filter((b) => readinessMap.get(b.id)?.ready).length,
      nextPaymentWindow,
      calendars,
    };
  });
}

export type UniversityRow = Awaited<ReturnType<typeof getUniversitiesOverview>>[number];
