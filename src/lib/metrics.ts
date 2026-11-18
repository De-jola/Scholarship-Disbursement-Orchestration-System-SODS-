import { db } from "@/lib/db";
import { summarizeFund } from "@/lib/fund";
import { humanize } from "@/lib/format";

export const CURRENT_SESSION = "2025/2026";
/** Payment windows open this many days before the registration start date. */
export const WINDOW_LEAD_DAYS = 14;

export type AlertKind =
  | "MISSING_CALENDAR"
  | "EXPIRED_CALENDAR"
  | "LATE_PORTAL_RESULT"
  | "DUPLICATE_DECLARATION"
  | "LOW_CONFIDENCE"
  | "BATCH_AWAITING_APPROVAL"
  | "PAYMENT_FAILURE";

export interface DashboardAlert {
  kind: AlertKind;
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  href: string;
}

const STATUS_ORDER = [
  "NOT_STARTED", "AWAITING_RESULT", "DOCUMENT_SUBMITTED", "EXTRACTED",
  "REVIEW_PENDING", "VERIFIED", "EXCEPTION", "REJECTED",
] as const;

export async function getDashboardData(now: Date) {
  const [fund, beneficiaries, universities, batches, lowConf, failedItems, activity, paidItems] = await Promise.all([
    db.fundAllocation.findFirst({ orderBy: { createdAt: "asc" } }),
    db.beneficiary.findMany({ select: { id: true, fullName: true, universityId: true, verificationStatus: true, exceptionType: true, exceptionResolvedAt: true, otherScholarshipDeclaration: true } }),
    db.university.findMany({ where: { status: "ACTIVE" }, include: { calendars: { include: { events: true } } }, orderBy: { name: "asc" } }),
    db.paymentBatch.findMany({ include: { university: true } }),
    db.resultSubmission.findMany({
      where: { status: { in: ["REVIEW_PENDING", "EXTRACTED"] }, extractionConfidence: { lt: 0.8, gt: 0 } },
      include: { beneficiary: true },
    }),
    db.paymentBatchItem.findMany({ where: { status: "FAILED" }, include: { beneficiary: true, batch: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.paymentBatchItem.findMany({ where: { status: "DISBURSEMENT_SIMULATED", paidAt: { not: null } } }),
  ]);

  const f = fund ?? { totalAmount: 0, committedAmount: 0, disbursedAmount: 0 };
  const pendingAmount = batches
    .filter((b) => b.status === "PENDING_APPROVAL" || b.status === "DRAFT")
    .reduce((s, b) => s + b.totalAmount, 0);
  const fs = summarizeFund(f, pendingAmount);

  const count = (st: string) => beneficiaries.filter((b) => b.verificationStatus === st).length;
  const activeException = (b: (typeof beneficiaries)[number]) => b.verificationStatus === "EXCEPTION" && !b.exceptionResolvedAt;

  const kpis = {
    totalFund: fs.total,
    available: fs.available,
    committed: fs.committed,
    disbursed: fs.disbursed,
    verified: count("VERIFIED"),
    pendingVerifications: count("DOCUMENT_SUBMITTED") + count("EXTRACTED") + count("REVIEW_PENDING"),
    batchesAwaitingApproval: batches.filter((b) => b.status === "PENDING_APPROVAL").length,
    exceptions: beneficiaries.filter(activeException).length + failedItems.length,
  };

  // ---- Alerts ----
  const alerts: DashboardAlert[] = [];
  const approvedCurrent = (u: (typeof universities)[number]) =>
    u.calendars.find((c) => c.session === CURRENT_SESSION && c.reviewStatus === "APPROVED");
  const regStart = (c: { events: { eventType: string; startDate: Date }[] }) =>
    c.events.find((e) => e.eventType === "REGISTRATION")?.startDate;

  for (const u of universities) {
    const current = u.calendars.find((c) => c.session === CURRENT_SESSION);
    if (!current) {
      const old = u.calendars.find((c) => c.reviewStatus === "APPROVED");
      if (old) {
        const end = old.events.find((e) => e.eventType === "SESSION_END")?.endDate;
        if (end && end < now) {
          alerts.push({ kind: "EXPIRED_CALENDAR", severity: "warning", title: `Expired calendar: ${u.name}`, detail: `The approved ${old.session} calendar ended ${end.toISOString().slice(0, 10)}. Upload the ${CURRENT_SESSION} calendar.`, href: "/universities" });
          continue;
        }
      }
      alerts.push({ kind: "MISSING_CALENDAR", severity: "warning", title: `Missing calendar: ${u.name}`, detail: `No ${CURRENT_SESSION} academic calendar on file. Payments for this university cannot be batched.`, href: "/universities" });
    }
  }

  for (const u of universities) {
    const cal = approvedCurrent(u);
    const start = cal ? regStart(cal) : undefined;
    if (!cal || !start) continue;
    const opens = new Date(start.getTime() - WINDOW_LEAD_DAYS * 86_400_000);
    if (now < opens) continue;
    const late = beneficiaries.filter((b) => b.universityId === u.id && b.verificationStatus === "AWAITING_RESULT");
    if (late.length) {
      alerts.push({ kind: "LATE_PORTAL_RESULT", severity: "info", title: `Late portal results: ${u.name}`, detail: `${late.length} beneficiar${late.length === 1 ? "y is" : "ies are"} awaiting a result while the payment window is open. A prior statement of result can be submitted.`, href: "/beneficiaries" });
    }
  }

  for (const b of beneficiaries.filter((x) => x.exceptionType === "DUPLICATE_SCHOLARSHIP" && !x.exceptionResolvedAt)) {
    alerts.push({ kind: "DUPLICATE_DECLARATION", severity: "danger", title: "Duplicate scholarship declared", detail: `${b.fullName} declared another scholarship and is excluded from batching until the exception is resolved.`, href: "/beneficiaries" });
  }
  for (const s of lowConf) {
    alerts.push({ kind: "LOW_CONFIDENCE", severity: "warning", title: "Low-confidence AI extraction", detail: `${s.beneficiary.fullName}: extraction confidence ${Math.round((s.extractionConfidence ?? 0) * 100)}%. Human review required.`, href: "/verification" });
  }
  for (const b of batches.filter((x) => x.status === "PENDING_APPROVAL")) {
    alerts.push({ kind: "BATCH_AWAITING_APPROVAL", severity: "info", title: "Batch awaiting finance approval", detail: `${b.batchName} (${b.university.shortName}) is waiting for a Finance Approver.`, href: "/batches" });
  }
  for (const i of failedItems) {
    alerts.push({ kind: "PAYMENT_FAILURE", severity: "danger", title: "Simulated payment failed", detail: `${i.beneficiary.fullName} in ${i.batch.batchName}: ${i.failureReason ?? "reason not recorded"}.`, href: `/batches/${i.batch.id}` });
  }

  // ---- Charts ----
  const statusBreakdown = STATUS_ORDER.map((s) => ({ status: s, label: humanize(s), count: count(s) }));

  const readiness = universities.map((u) => ({
    university: u.shortName,
    verified: beneficiaries.filter((b) => b.universityId === u.id && b.verificationStatus === "VERIFIED").length,
    pending: beneficiaries.filter((b) => b.universityId === u.id && !["VERIFIED", "EXCEPTION", "REJECTED"].includes(b.verificationStatus)).length,
    blocked: beneficiaries.filter((b) => b.universityId === u.id && ["EXCEPTION", "REJECTED"].includes(b.verificationStatus)).length,
  }));

  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  const months = new Map<string, { month: string; disbursed: number; committed: number }>();
  const bucket = (k: string) => {
    if (!months.has(k)) months.set(k, { month: k, disbursed: 0, committed: 0 });
    return months.get(k)!;
  };
  for (const i of paidItems) if (i.paidAt) bucket(monthKey(i.paidAt)).disbursed += i.amount;
  for (const b of batches.filter((x) => x.status === "APPROVED")) bucket(monthKey(b.scheduledDate)).committed += b.totalAmount;
  const trend = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

  return { kpis, alerts, statusBreakdown, readiness, trend, activity, pendingAmount };
}
