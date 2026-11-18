/**
 * Payment-readiness rules engine. Pure functions only: no database, clock or framework access,
 * so every rule can be unit-tested and explained to auditors.
 *
 * A beneficiary is payment-ready when:
 *   1. Their university has an APPROVED academic calendar.
 *   2. The simulated date is within, or shortly before (WINDOW_LEAD_DAYS), the approved registration window.
 *   3. Their verification status is VERIFIED (never rejected, never merely extracted).
 *   4. They have no active duplicate-scholarship exception (or any other open exception).
 *   5. A bank-account token exists.
 *   6. Their amount can be allocated without exceeding the available fund balance.
 */

export const WINDOW_LEAD_DAYS = 14;
const DAY = 86_400_000;

export type ReasonCode =
  | "CALENDAR_NOT_APPROVED" | "NO_REGISTRATION_EVENT" | "WINDOW_NOT_OPEN" | "NOT_VERIFIED" | "VERIFICATION_REJECTED"
  | "DUPLICATE_EXCEPTION" | "EXCEPTION_OPEN" | "NO_BANK_TOKEN" | "INSUFFICIENT_FUNDS" | "ALREADY_BATCHED" | "SCHOLARSHIP_INACTIVE";

export interface Reason { code: ReasonCode; message: string }
export interface Warning { code: "LATE_WINDOW"; message: string }

export interface CalendarFacts {
  reviewStatus: string;
  events: { eventType: string; startDate: Date; endDate: Date }[];
}

export interface BeneficiaryFacts {
  id: string;
  universityId: string;
  fullName: string;
  verificationStatus: string;
  exceptionType: string | null;
  exceptionResolvedAt: Date | null;
  otherScholarshipDeclaration: boolean;
  bankAccountToken: string | null;
  scholarshipStatus: string;
  /** True when already in a DRAFT, PENDING_APPROVAL, APPROVED or paid batch for the current session. */
  alreadyBatched: boolean;
}

export interface PaymentWindow { opensAt: Date; registrationStart: Date; registrationEnd: Date }

export function paymentWindow(calendar: CalendarFacts | null): PaymentWindow | null {
  const reg = calendar?.events.find((e) => e.eventType === "REGISTRATION");
  if (!reg) return null;
  return { opensAt: new Date(reg.startDate.getTime() - WINDOW_LEAD_DAYS * DAY), registrationStart: reg.startDate, registrationEnd: reg.endDate };
}

export interface Readiness {
  ready: boolean;
  reasons: Reason[];
  warnings: Warning[];
  windowOpensAt: Date | null;
}

export function evaluateReadiness(input: {
  beneficiary: BeneficiaryFacts;
  calendar: CalendarFacts | null;
  now: Date;
  amount: number;
  availableFunds: number;
}): Readiness {
  const { beneficiary: b, calendar, now, amount, availableFunds } = input;
  const reasons: Reason[] = [];
  const warnings: Warning[] = [];
  const add = (code: ReasonCode, message: string) => reasons.push({ code, message });

  if (b.scholarshipStatus !== "ACTIVE") add("SCHOLARSHIP_INACTIVE", `Scholarship status is ${b.scholarshipStatus.toLowerCase()}; payments are only made to active scholars.`);

  // Rule 1 and 2: calendar and payment window.
  const approved = calendar?.reviewStatus === "APPROVED";
  if (!approved) add("CALENDAR_NOT_APPROVED", "The university's academic calendar has not been approved. Awaiting calendar approval.");
  let windowOpensAt: Date | null = null;
  if (approved) {
    const w = paymentWindow(calendar);
    if (!w) add("NO_REGISTRATION_EVENT", "The approved calendar has no registration event, so no payment window can be derived.");
    else {
      windowOpensAt = w.opensAt;
      if (now < w.opensAt) add("WINDOW_NOT_OPEN", `The payment window opens on ${w.opensAt.toISOString().slice(0, 10)} (${WINDOW_LEAD_DAYS} days before registration starts).`);
      else if (now > w.registrationEnd) warnings.push({ code: "LATE_WINDOW", message: "Registration has closed; this payment is late relative to the institution's registration window." });
    }
  }

  // Rule 3 and 4: verification and exceptions.
  if (b.verificationStatus === "REJECTED") add("VERIFICATION_REJECTED", "Verification was rejected. A rejected verification prevents payment.");
  else if (b.verificationStatus !== "VERIFIED" && b.verificationStatus !== "EXCEPTION") add("NOT_VERIFIED", "Verification is not complete. A human-approved verification is required.");

  const openException = b.verificationStatus === "EXCEPTION" && !b.exceptionResolvedAt;
  if (b.exceptionType === "DUPLICATE_SCHOLARSHIP" && !b.exceptionResolvedAt) {
    add("DUPLICATE_EXCEPTION", "Duplicate scholarship declared. Excluded from batching until an administrator resolves the exception.");
  } else if (openException) {
    add("EXCEPTION_OPEN", "Exception — manual review required. Exceptions prevent automatic batching.");
  }

  // Rule 5: bank token.
  if (!b.bankAccountToken) add("NO_BANK_TOKEN", "No bank-account token is on file for this beneficiary.");

  if (b.alreadyBatched) add("ALREADY_BATCHED", "Already included in a payment batch for this session.");

  // Rule 6: funds.
  if (amount > availableFunds) add("INSUFFICIENT_FUNDS", "Fund allocation exceeded: the available fund balance cannot cover this payment.");

  return { ready: reasons.length === 0, reasons, warnings, windowOpensAt };
}

export type CategoryKey =
  | "READY" | "AWAITING_CALENDAR" | "WINDOW_NOT_OPEN" | "VERIFICATION_PENDING" | "DUPLICATE" | "EXCEPTION"
  | "REJECTED" | "NO_BANK_TOKEN" | "FUNDS" | "IN_BATCH" | "INACTIVE";

export interface Category { key: CategoryKey; label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }

export const CATEGORIES: Record<CategoryKey, Category> = {
  READY: { key: "READY", label: "Payment-ready", tone: "success" },
  AWAITING_CALENDAR: { key: "AWAITING_CALENDAR", label: "Awaiting calendar approval", tone: "warning" },
  WINDOW_NOT_OPEN: { key: "WINDOW_NOT_OPEN", label: "Payment window not yet open", tone: "info" },
  VERIFICATION_PENDING: { key: "VERIFICATION_PENDING", label: "Verification pending", tone: "info" },
  DUPLICATE: { key: "DUPLICATE", label: "Duplicate scholarship declared", tone: "danger" },
  EXCEPTION: { key: "EXCEPTION", label: "Exception — manual review required", tone: "danger" },
  REJECTED: { key: "REJECTED", label: "Verification rejected", tone: "danger" },
  NO_BANK_TOKEN: { key: "NO_BANK_TOKEN", label: "Bank account token missing", tone: "warning" },
  FUNDS: { key: "FUNDS", label: "Fund allocation exceeded", tone: "warning" },
  IN_BATCH: { key: "IN_BATCH", label: "In a payment batch", tone: "neutral" },
  INACTIVE: { key: "INACTIVE", label: "Scholarship not active", tone: "neutral" },
};

/** Most relevant blocker first, so the UI shows one clear label. */
const PRECEDENCE: [ReasonCode, CategoryKey][] = [
  ["SCHOLARSHIP_INACTIVE", "INACTIVE"], ["VERIFICATION_REJECTED", "REJECTED"], ["DUPLICATE_EXCEPTION", "DUPLICATE"],
  ["EXCEPTION_OPEN", "EXCEPTION"], ["NOT_VERIFIED", "VERIFICATION_PENDING"], ["CALENDAR_NOT_APPROVED", "AWAITING_CALENDAR"],
  ["NO_REGISTRATION_EVENT", "AWAITING_CALENDAR"], ["WINDOW_NOT_OPEN", "WINDOW_NOT_OPEN"], ["ALREADY_BATCHED", "IN_BATCH"],
  ["NO_BANK_TOKEN", "NO_BANK_TOKEN"], ["INSUFFICIENT_FUNDS", "FUNDS"],
];

export function readinessCategory(r: Readiness): Category {
  if (r.ready) return CATEGORIES.READY;
  const present = new Set(r.reasons.map((x) => x.code));
  for (const [code, key] of PRECEDENCE) if (present.has(code)) return CATEGORIES[key];
  return CATEGORIES.VERIFICATION_PENDING;
}

// ---- Batch planning ---------------------------------------------------------------------------

export interface PlannedGroup {
  universityId: string;
  universityName: string;
  windowOpensAt: Date;
  beneficiaryIds: string[];
  totalAmount: number;
}

export interface BatchPlan {
  groups: PlannedGroup[];
  excluded: { beneficiaryId: string; reasons: Reason[] }[];
  totalAmount: number;
}

/**
 * Groups payment-ready beneficiaries by university and payment-window date (never one national batch),
 * allocating the available fund earliest window first. Anyone who does not fit is excluded, not silently dropped.
 */
export function planBatches(input: {
  beneficiaries: BeneficiaryFacts[];
  calendars: Record<string, CalendarFacts | null>;
  universityNames: Record<string, string>;
  now: Date;
  amount: number;
  availableFunds: number;
}): BatchPlan {
  const excluded: BatchPlan["excluded"] = [];
  const candidates: { b: BeneficiaryFacts; opensAt: Date }[] = [];

  for (const b of input.beneficiaries) {
    // Evaluate rules 1-5 first; funds are applied afterwards in allocation order.
    const r = evaluateReadiness({ beneficiary: b, calendar: input.calendars[b.universityId] ?? null, now: input.now, amount: input.amount, availableFunds: Infinity });
    if (r.ready && r.windowOpensAt) candidates.push({ b, opensAt: r.windowOpensAt });
    else excluded.push({ beneficiaryId: b.id, reasons: r.reasons });
  }

  const name = (id: string) => input.universityNames[id] ?? id;
  candidates.sort((x, y) =>
    x.opensAt.getTime() - y.opensAt.getTime() || name(x.b.universityId).localeCompare(name(y.b.universityId)) || x.b.fullName.localeCompare(y.b.fullName));

  let remaining = input.availableFunds;
  const groups = new Map<string, PlannedGroup>();
  for (const { b, opensAt } of candidates) {
    if (remaining < input.amount) {
      excluded.push({ beneficiaryId: b.id, reasons: [{ code: "INSUFFICIENT_FUNDS", message: "Fund allocation exceeded: the available fund balance cannot cover this payment." }] });
      continue;
    }
    remaining -= input.amount;
    const key = `${b.universityId}|${opensAt.toISOString().slice(0, 10)}`;
    const g = groups.get(key) ?? { universityId: b.universityId, universityName: name(b.universityId), windowOpensAt: opensAt, beneficiaryIds: [], totalAmount: 0 };
    g.beneficiaryIds.push(b.id);
    g.totalAmount += input.amount;
    groups.set(key, g);
  }

  const list = [...groups.values()];
  return { groups: list, excluded, totalAmount: list.reduce((s, g) => s + g.totalAmount, 0) };
}
