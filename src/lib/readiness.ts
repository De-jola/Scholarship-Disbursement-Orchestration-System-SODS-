import { db } from "@/lib/db";
import { CURRENT_SESSION, STANDARD_AMOUNT } from "@/lib/constants";
import { selectEffectiveCalendar } from "@/lib/effective-calendar";
import { summarizeFund } from "@/lib/fund";
import {
  evaluateReadiness, planBatches, readinessCategory,
  type BatchPlan, type BeneficiaryFacts, type CalendarFacts, type Category, type Readiness,
} from "@/lib/rules";

export type ReadinessView = Readiness & { category: Category };

/** Batches that count as "the beneficiary already has a payment scheduled or made". */
const ACTIVE_BATCH = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "DISBURSEMENT_SIMULATED", "FAILED"] as const;

/** Fund left to allocate to NEW batches: available balance minus amounts already earmarked in draft/pending batches. */
export async function allocatableFunds(): Promise<number> {
  const [fund, open] = await Promise.all([
    db.fundAllocation.findFirst({ orderBy: { createdAt: "asc" } }),
    db.paymentBatch.findMany({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } }, select: { totalAmount: true } }),
  ]);
  if (!fund) return 0;
  const earmarked = open.reduce((s, b) => s + b.totalAmount, 0);
  return Math.max(0, summarizeFund(fund, 0).available - earmarked);
}

export async function loadFacts(now: Date) {
  const [people, unis, items] = await Promise.all([
    db.beneficiary.findMany({ where: { university: { status: "ACTIVE" } } }),
    db.university.findMany({ where: { status: "ACTIVE" }, include: { calendars: { include: { events: true } } } }),
    db.paymentBatchItem.findMany({ where: { batch: { status: { in: [...ACTIVE_BATCH] } } }, select: { beneficiaryId: true, batch: { select: { academicSession: true } } } }),
  ]);
  const batchedSessions = new Map<string, Set<string>>();
  for (const i of items) {
    const set = batchedSessions.get(i.beneficiaryId) ?? new Set<string>();
    set.add(i.batch.academicSession);
    batchedSessions.set(i.beneficiaryId, set);
  }

  const calendars: Record<string, CalendarFacts | null> = {};
  const universityNames: Record<string, string> = {};
  /** Session each university is currently operating in, from its latest approved calendar. */
  const sessions: Record<string, string> = {};
  for (const u of unis) {
    universityNames[u.id] = u.name;
    const eff = selectEffectiveCalendar(u.calendars, now);
    sessions[u.id] = eff.session ?? CURRENT_SESSION;
    // An expired calendar must not authorise payments, so it is reported as EXPIRED rather than APPROVED.
    calendars[u.id] = eff.calendar ? { reviewStatus: eff.status === "EXPIRED" ? "EXPIRED" : eff.calendar.reviewStatus, events: eff.calendar.events.map((e) => ({ eventType: e.eventType, startDate: e.startDate, endDate: e.endDate })) } : null;
  }

  const beneficiaries: BeneficiaryFacts[] = people.map((b) => ({
    id: b.id, universityId: b.universityId, fullName: b.fullName, verificationStatus: b.verificationStatus,
    exceptionType: b.exceptionType, exceptionResolvedAt: b.exceptionResolvedAt, otherScholarshipDeclaration: b.otherScholarshipDeclaration,
    bankAccountToken: b.bankAccountToken, scholarshipStatus: b.scholarshipStatus, alreadyBatched: batchedSessions.get(b.id)?.has(sessions[b.universityId]) ?? false,
  }));
  return { facts: { beneficiaries, calendars, universityNames }, sessions };
}

export async function getBatchPlan(now: Date): Promise<BatchPlan> {
  const [{ facts }, availableFunds] = await Promise.all([loadFacts(now), allocatableFunds()]);
  return planBatches({ ...facts, now, amount: STANDARD_AMOUNT, availableFunds });
}

/** Readiness for every beneficiary, with fund allocation applied earliest payment window first. */
export async function getReadinessMap(now: Date): Promise<Map<string, ReadinessView>> {
  const [{ facts }, availableFunds] = await Promise.all([loadFacts(now), allocatableFunds()]);
  const base = new Map<string, Readiness>();
  for (const b of facts.beneficiaries) {
    base.set(b.id, evaluateReadiness({ beneficiary: b, calendar: facts.calendars[b.universityId] ?? null, now, amount: STANDARD_AMOUNT, availableFunds: Infinity }));
  }
  // Reuse the planner's allocation so list views and batch creation can never disagree.
  const plan = planBatches({ ...facts, now, amount: STANDARD_AMOUNT, availableFunds });
  for (const ex of plan.excluded) {
    const short = ex.reasons.find((r) => r.code === "INSUFFICIENT_FUNDS");
    const r = base.get(ex.beneficiaryId);
    if (short && r?.ready) base.set(ex.beneficiaryId, { ...r, ready: false, reasons: [short] });
  }
  const out = new Map<string, ReadinessView>();
  for (const [id, r] of base) out.set(id, { ...r, category: readinessCategory(r) });
  return out;
}
