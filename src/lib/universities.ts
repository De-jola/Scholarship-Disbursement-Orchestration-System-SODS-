import { db } from "@/lib/db";
import { CURRENT_SESSION } from "@/lib/constants";
import { selectEffectiveCalendar, type CalendarState } from "@/lib/effective-calendar";
import { getReadinessMap } from "@/lib/readiness";

export type { CalendarState };

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
    correctedByName: string | null;
    correctedAt: string | null;
    original: { title: string; eventType: string; startDate: string; endDate: string; confidence: number } | null;
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
    // The latest approved calendar governs the university; see selectEffectiveCalendar.
    const eff = selectEffectiveCalendar(u.calendars, now);
    const calendarStatus: CalendarState = eff.status;
    const nextPaymentWindow = eff.windowOpensAt;

    const calendars: CalendarView[] = [...u.calendars].sort((x, y) => y.session.localeCompare(x.session) || y.createdAt.getTime() - x.createdAt.getTime()).map((c) => ({
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
        correctedByName: e.correctedByName, correctedAt: e.correctedAt?.toISOString() ?? null,
        original: e.originalValue ? JSON.parse(e.originalValue) : null,
      })),
    }));

    return {
      id: u.id,
      name: u.name,
      shortName: u.shortName,
      state: u.state,
      calendarStatus,
      currentSession: eff.session ?? CURRENT_SESSION,
      pendingSession: eff.pendingSession,
      beneficiaryCount: u.beneficiaries.length,
      verifiedCount: u.beneficiaries.filter((b) => b.verificationStatus === "VERIFIED").length,
      readyCount: u.beneficiaries.filter((b) => readinessMap.get(b.id)?.ready).length,
      nextPaymentWindow,
      calendars,
    };
  });
}

export type UniversityRow = Awaited<ReturnType<typeof getUniversitiesOverview>>[number];
