import { describe, expect, it } from "vitest";
import {
  evaluateReadiness, paymentWindow, planBatches, readinessCategory, WINDOW_LEAD_DAYS,
  type BeneficiaryFacts, type CalendarFacts,
} from "@/lib/rules";

const d = (s: string) => new Date(`${s}T09:00:00.000Z`);
const NOW = d("2025-10-10");

const calendar = (over: Partial<CalendarFacts> = {}): CalendarFacts => ({
  reviewStatus: "APPROVED",
  events: [{ eventType: "REGISTRATION", startDate: d("2025-10-06"), endDate: d("2025-10-31") }],
  ...over,
});

const person = (over: Partial<BeneficiaryFacts> = {}): BeneficiaryFacts => ({
  id: "b1", universityId: "u1", fullName: "Ada Obi", verificationStatus: "VERIFIED", exceptionType: null, exceptionResolvedAt: null,
  otherScholarshipDeclaration: false, bankAccountToken: "tok_1", scholarshipStatus: "ACTIVE", alreadyBatched: false, ...over,
});

const evalWith = (p: Partial<BeneficiaryFacts> = {}, cal: CalendarFacts | null = calendar(), now = NOW, amount = 150_000, funds = 1_000_000) =>
  evaluateReadiness({ beneficiary: person(p), calendar: cal, now, amount, availableFunds: funds });

const codes = (r: ReturnType<typeof evalWith>) => r.reasons.map((x) => x.code);

describe("paymentWindow", () => {
  it("opens WINDOW_LEAD_DAYS before registration starts", () => {
    expect(WINDOW_LEAD_DAYS).toBe(14);
    const w = paymentWindow(calendar())!;
    expect(w.opensAt.toISOString().slice(0, 10)).toBe("2025-09-22");
    expect(w.registrationEnd.toISOString().slice(0, 10)).toBe("2025-10-31");
  });
  it("is null without a registration event", () => {
    expect(paymentWindow(calendar({ events: [] }))).toBeNull();
  });
});

describe("evaluateReadiness: the six payment-ready rules", () => {
  it("is ready when every rule passes", () => {
    const r = evalWith();
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("rule 1: requires an APPROVED academic calendar", () => {
    expect(codes(evalWith({}, null))).toContain("CALENDAR_NOT_APPROVED");
    expect(codes(evalWith({}, calendar({ reviewStatus: "PENDING_REVIEW" })))).toContain("CALENDAR_NOT_APPROVED");
    expect(codes(evalWith({}, calendar({ reviewStatus: "REJECTED" })))).toContain("CALENDAR_NOT_APPROVED");
    expect(codes(evalWith({}, calendar({ reviewStatus: "DRAFT" })))).toContain("CALENDAR_NOT_APPROVED");
  });

  it("rule 1: an approved calendar with no registration event cannot open a window", () => {
    expect(codes(evalWith({}, calendar({ events: [] })))).toContain("NO_REGISTRATION_EVENT");
  });

  it("rule 2: not ready before the window opens; ready on the opening day", () => {
    const before = evalWith({}, calendar(), d("2025-09-21"));
    expect(before.ready).toBe(false);
    expect(codes(before)).toContain("WINDOW_NOT_OPEN");
    expect(before.windowOpensAt?.toISOString().slice(0, 10)).toBe("2025-09-22");
    expect(evalWith({}, calendar(), d("2025-09-22")).ready).toBe(true);
  });

  it("rule 2: ready during registration, and after it closes with a late-payment warning", () => {
    expect(evalWith({}, calendar(), d("2025-10-20")).ready).toBe(true);
    const late = evalWith({}, calendar(), d("2025-11-15"));
    expect(late.ready).toBe(true);
    expect(late.warnings.map((w) => w.code)).toContain("LATE_WINDOW");
    expect(evalWith({}, calendar(), d("2025-10-20")).warnings).toEqual([]);
  });

  it("rule 3: only VERIFIED beneficiaries are ready", () => {
    for (const s of ["NOT_STARTED", "AWAITING_RESULT", "DOCUMENT_SUBMITTED", "EXTRACTED", "REVIEW_PENDING"] as const) {
      expect(codes(evalWith({ verificationStatus: s }))).toContain("NOT_VERIFIED");
    }
  });

  it("a rejected verification prevents payment", () => {
    const r = evalWith({ verificationStatus: "REJECTED" });
    expect(r.ready).toBe(false);
    expect(codes(r)).toContain("VERIFICATION_REJECTED");
  });

  it("rule 4: an active duplicate-scholarship exception blocks payment", () => {
    const r = evalWith({ verificationStatus: "EXCEPTION", exceptionType: "DUPLICATE_SCHOLARSHIP", otherScholarshipDeclaration: true });
    expect(r.ready).toBe(false);
    expect(codes(r)).toContain("DUPLICATE_EXCEPTION");
  });

  it("rule 4: a resolved duplicate exception no longer blocks", () => {
    const r = evalWith({ verificationStatus: "VERIFIED", exceptionType: "DUPLICATE_SCHOLARSHIP", exceptionResolvedAt: d("2025-10-01"), otherScholarshipDeclaration: true });
    expect(r.ready).toBe(true);
  });

  it("any open exception prevents automatic batching", () => {
    const r = evalWith({ verificationStatus: "EXCEPTION", exceptionType: "UNREADABLE_DOCUMENT" });
    expect(r.ready).toBe(false);
    expect(codes(r)).toContain("EXCEPTION_OPEN");
  });

  it("rule 5: requires a bank-account token", () => {
    expect(codes(evalWith({ bankAccountToken: null }))).toContain("NO_BANK_TOKEN");
    expect(codes(evalWith({ bankAccountToken: "" }))).toContain("NO_BANK_TOKEN");
  });

  it("rule 6: amount must fit in the available fund balance (exact fit is allowed)", () => {
    expect(evalWith({}, calendar(), NOW, 150_000, 150_000).ready).toBe(true);
    const r = evalWith({}, calendar(), NOW, 150_000, 149_999);
    expect(r.ready).toBe(false);
    expect(codes(r)).toContain("INSUFFICIENT_FUNDS");
  });

  it("a beneficiary already in an active batch is not ready again", () => {
    expect(codes(evalWith({ alreadyBatched: true }))).toContain("ALREADY_BATCHED");
  });

  it("suspended or completed scholarships are not payable", () => {
    expect(codes(evalWith({ scholarshipStatus: "SUSPENDED" }))).toContain("SCHOLARSHIP_INACTIVE");
    expect(codes(evalWith({ scholarshipStatus: "COMPLETED" }))).toContain("SCHOLARSHIP_INACTIVE");
  });

  it("reports every failing rule, not just the first", () => {
    const r = evalWith({ verificationStatus: "NOT_STARTED", bankAccountToken: null }, null);
    expect(codes(r)).toEqual(expect.arrayContaining(["CALENDAR_NOT_APPROVED", "NOT_VERIFIED", "NO_BANK_TOKEN"]));
    expect(r.reasons.every((x) => x.message.length > 10)).toBe(true);
  });
});

describe("readinessCategory", () => {
  it("maps to professional labels with the most relevant blocker first", () => {
    expect(readinessCategory(evalWith()).label).toBe("Payment-ready");
    expect(readinessCategory(evalWith({}, calendar({ reviewStatus: "PENDING_REVIEW" }))).label).toBe("Awaiting calendar approval");
    expect(readinessCategory(evalWith({ verificationStatus: "REVIEW_PENDING" })).label).toBe("Verification pending");
    expect(readinessCategory(evalWith({ verificationStatus: "EXCEPTION", exceptionType: "DUPLICATE_SCHOLARSHIP" })).label).toBe("Duplicate scholarship declared");
    expect(readinessCategory(evalWith({ verificationStatus: "EXCEPTION", exceptionType: "OTHER" })).label).toBe("Exception — manual review required");
    expect(readinessCategory(evalWith({}, calendar(), d("2025-09-01"))).label).toBe("Payment window not yet open");
    expect(readinessCategory(evalWith({}, calendar(), NOW, 150_000, 10)).label).toBe("Fund allocation exceeded");
    expect(readinessCategory(evalWith({ verificationStatus: "REJECTED" })).label).toBe("Verification rejected");
    expect(readinessCategory(evalWith({ alreadyBatched: true })).label).toBe("In a payment batch");
  });
  it("exposes a stable key for filtering", () => {
    expect(readinessCategory(evalWith()).key).toBe("READY");
    expect(readinessCategory(evalWith({ bankAccountToken: null })).key).toBe("NO_BANK_TOKEN");
  });
});

describe("planBatches", () => {
  const cal = (reg: string, end: string): CalendarFacts => ({ reviewStatus: "APPROVED", events: [{ eventType: "REGISTRATION", startDate: d(reg), endDate: d(end) }] });
  const mk = (id: string, universityId: string, over: Partial<BeneficiaryFacts> = {}) => person({ id, universityId, fullName: id, ...over });

  const input = (funds: number) => ({
    beneficiaries: [mk("a1", "A"), mk("a2", "A"), mk("b1", "B"), mk("c1", "C"), mk("c2", "C", { verificationStatus: "REVIEW_PENDING" })],
    calendars: { A: cal("2025-10-06", "2025-10-31"), B: cal("2025-12-01", "2025-12-19"), C: cal("2026-01-12", "2026-01-30") },
    universityNames: { A: "Alpha University", B: "Beta University", C: "Gamma University" },
    now: d("2026-01-12"), amount: 100_000, availableFunds: funds,
  });

  it("creates one group per university and payment-window date, never one national batch", () => {
    const plan = planBatches(input(10_000_000));
    expect(plan.groups.map((g) => g.universityId)).toEqual(["A", "B", "C"]);
    expect(plan.groups.map((g) => g.windowOpensAt.toISOString().slice(0, 10))).toEqual(["2025-09-22", "2025-11-17", "2025-12-29"]);
    expect(plan.groups.map((g) => g.beneficiaryIds)).toEqual([["a1", "a2"], ["b1"], ["c1"]]);
    expect(plan.groups.map((g) => g.totalAmount)).toEqual([200_000, 100_000, 100_000]);
  });

  it("excludes beneficiaries who are not ready and says why", () => {
    const plan = planBatches(input(10_000_000));
    const ex = plan.excluded.find((e) => e.beneficiaryId === "c2")!;
    expect(ex.reasons.map((r) => r.code)).toContain("NOT_VERIFIED");
  });

  it("does not create groups for universities whose window has not opened", () => {
    const p = input(10_000_000);
    p.now = d("2025-10-10");
    const plan = planBatches(p);
    expect(plan.groups.map((g) => g.universityId)).toEqual(["A"]);
    expect(plan.excluded.filter((e) => e.reasons.some((r) => r.code === "WINDOW_NOT_OPEN")).map((e) => e.beneficiaryId)).toEqual(expect.arrayContaining(["b1", "c1"]));
  });

  it("respects the available fund, allocating earliest windows first and excluding the rest", () => {
    const plan = planBatches(input(250_000));
    expect(plan.groups.map((g) => g.beneficiaryIds)).toEqual([["a1", "a2"]]);
    const short = plan.excluded.filter((e) => e.reasons.some((r) => r.code === "INSUFFICIENT_FUNDS")).map((e) => e.beneficiaryId);
    expect(short).toEqual(expect.arrayContaining(["b1", "c1"]));
    expect(plan.totalAmount).toBe(200_000);
  });

  it("returns no groups when nobody is ready", () => {
    const p = input(10_000_000);
    p.beneficiaries = [mk("x", "A", { verificationStatus: "NOT_STARTED" })];
    expect(planBatches(p).groups).toEqual([]);
  });

  it("skips beneficiaries already in a batch", () => {
    const p = input(10_000_000);
    p.beneficiaries = [mk("a1", "A", { alreadyBatched: true }), mk("a2", "A")];
    expect(planBatches(p).groups[0].beneficiaryIds).toEqual(["a2"]);
  });
});
