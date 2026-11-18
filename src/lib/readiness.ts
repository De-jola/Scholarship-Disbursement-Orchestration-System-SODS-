import { db } from "@/lib/db";
import { CURRENT_SESSION, STANDARD_AMOUNT } from "@/lib/constants";
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

async function loadFacts() {
  const [people, unis, items] = await Promise.all([
    db.beneficiary.findMany({ where: { university: { status: "ACTIVE" } } }),
    db.university.findMany({ where: { status: "ACTIVE" }, include: { calendars: { where: { session: CURRENT_SESSION }, include: { events: true } } } }),
    db.paymentBatchItem.findMany({ where: { batch: { status: { in: [...ACTIVE_BATCH] }, academicSession: CURRENT_SESSION } }, select: { beneficiaryId: true } }),
  ]);
  const batched = new Set(items.map((i) => i.beneficiaryId));

  const calendars: Record<string, CalendarFacts | null> = {};
  const universityNames: Record<string, string> = {};
  for (const u of unis) {
    universityNames[u.id] = u.name;
    const cal = u.calendars.find((c) => c.reviewStatus === "APPROVED") ?? u.calendars.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    calendars[u.id] = cal ? { reviewStatus: cal.reviewStatus, events: cal.events.map((e) => ({ eventType: e.eventType, startDate: e.startDate, endDate: e.endDate })) } : null;
  }

  const beneficiaries: BeneficiaryFacts[] = people.map((b) => ({
    id: b.id, universityId: b.universityId, fullName: b.fullName, verificationStatus: b.verificationStatus,
    exceptionType: b.exceptionType, exceptionResolvedAt: b.exceptionResolvedAt, otherScholarshipDeclaration: b.otherScholarshipDeclaration,
    bankAccountToken: b.bankAccountToken, scholarshipStatus: b.scholarshipStatus, alreadyBatched: batched.has(b.id),
  }));
  return { beneficiaries, calendars, universityNames };
}

export async function getBatchPlan(now: Date): Promise<BatchPlan> {
  const [facts, availableFunds] = await Promise.all([loadFacts(), allocatableFunds()]);
  return planBatches({ ...facts, now, amount: STANDARD_AMOUNT, availableFunds });
}

/** Readiness for every beneficiary, with fund allocation applied earliest payment window first. */
export async function getReadinessMap(now: Date): Promise<Map<string, ReadinessView>> {
  const [facts, availableFunds] = await Promise.all([loadFacts(), allocatableFunds()]);
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
