import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const admin = { userId: "u1", name: "Adaeze Okonkwo", role: "ADMIN" as const, email: "x" };

beforeAll(async () => {
  prisma = await createSeededDb("beneficiaries");
}, 120_000);
afterAll(async () => prisma.$disconnect());

describe("listBeneficiaries", () => {
  it("returns every beneficiary with university and most recent activity first", async () => {
    const { listBeneficiaries } = await import("@/lib/beneficiaries");
    const rows = await listBeneficiaries({});
    expect(rows).toHaveLength(await prisma.beneficiary.count());
    expect(rows[0].universityShortName).toBeTruthy();
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].lastActivityAt >= rows[i].lastActivityAt).toBe(true);
  });

  it("filters by university, verification status, session and exception type", async () => {
    const { listBeneficiaries } = await import("@/lib/beneficiaries");
    const nsu = await prisma.university.findFirstOrThrow({ where: { shortName: "NSU" } });
    expect((await listBeneficiaries({ universityId: nsu.id })).every((r) => r.universityShortName === "NSU")).toBe(true);
    expect((await listBeneficiaries({ status: "VERIFIED" })).length).toBe(24);
    expect(await listBeneficiaries({ session: "2019/2020" })).toHaveLength(0);
    const dup = await listBeneficiaries({ exceptionType: "DUPLICATE_SCHOLARSHIP" });
    expect(dup).toHaveLength(1);
    expect(dup[0].otherScholarshipDeclaration).toBe(true);
  });

  it("searches name, matric number and application reference case-insensitively", async () => {
    const { listBeneficiaries } = await import("@/lib/beneficiaries");
    const one = await prisma.beneficiary.findFirstOrThrow();
    expect((await listBeneficiaries({ q: one.fullName.toUpperCase() })).map((r) => r.id)).toContain(one.id);
    expect((await listBeneficiaries({ q: one.matricNumber.toLowerCase() })).map((r) => r.id)).toContain(one.id);
    expect((await listBeneficiaries({ q: one.applicationRef })).map((r) => r.id)).toContain(one.id);
    expect(await listBeneficiaries({ q: "zzzz-no-match" })).toHaveLength(0);
  });
});

describe("getBeneficiaryDetail", () => {
  it("includes timeline (newest first), documents with fields, payment history and calendar status", async () => {
    const { getBeneficiaryDetail } = await import("@/lib/beneficiaries");
    const paid = await prisma.paymentBatchItem.findFirstOrThrow({ where: { status: "DISBURSEMENT_SIMULATED" } });
    const d = await getBeneficiaryDetail(paid.beneficiaryId);
    expect(d).not.toBeNull();
    expect(d!.timeline.length).toBeGreaterThan(0);
    expect(d!.submissions[0].fields.length).toBeGreaterThan(0);
    expect(d!.payments).toHaveLength(1);
    expect(d!.payments[0].amount).toBe(150_000);
    expect(d!.calendar?.reviewStatus).toBe("APPROVED");
    expect(d!.bankAccountMasked).toMatch(/^\*{4}\d{4}$/);
  });

  it("returns null for an unknown id", async () => {
    const { getBeneficiaryDetail } = await import("@/lib/beneficiaries");
    expect(await getBeneficiaryDetail("nope")).toBeNull();
  });
});

describe("duplicate-scholarship exceptions", () => {
  it("declaring another scholarship raises an exception, a verification event and an audit entry", async () => {
    const { declareDuplicateScholarship } = await import("@/lib/beneficiary-service");
    const target = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "VERIFIED", university: { shortName: "DPU" } } });
    await declareDuplicateScholarship(admin, target.id, "Declared a state bursary on the annual form");
    const after = await prisma.beneficiary.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.verificationStatus).toBe("EXCEPTION");
    expect(after.exceptionType).toBe("DUPLICATE_SCHOLARSHIP");
    expect(after.otherScholarshipDeclaration).toBe(true);
    expect(await prisma.verificationEvent.count({ where: { beneficiaryId: target.id, eventType: "DUPLICATE_FLAGGED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { beneficiaryId: target.id, action: "EXCEPTION_RAISED" } })).toBe(1);
  });

  it("requires a note to resolve, and clearing restores VERIFIED when a document was previously approved", async () => {
    const { resolveException } = await import("@/lib/beneficiary-service");
    const target = await prisma.beneficiary.findFirstOrThrow({ where: { exceptionType: "DUPLICATE_SCHOLARSHIP", exceptionResolvedAt: null, university: { shortName: "CUT" } } });
    await expect(resolveException(admin, target.id, "CLEARED", " ")).rejects.toThrow(/note/i);
    await resolveException(admin, target.id, "CLEARED", "Other award confirmed as non-monetary; no overlap");
    const after = await prisma.beneficiary.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.verificationStatus).toBe("VERIFIED");
    expect(after.exceptionResolvedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { beneficiaryId: target.id, action: "EXCEPTION_RESOLVED" } })).toBe(1);
  });

  it("rejecting a confirmed duplicate marks the beneficiary REJECTED", async () => {
    const { resolveException } = await import("@/lib/beneficiary-service");
    const target = await prisma.beneficiary.findFirstOrThrow({ where: { exceptionType: "DUPLICATE_SCHOLARSHIP", exceptionResolvedAt: null } });
    await resolveException(admin, target.id, "REJECTED", "Concurrent scholarship confirmed; ineligible this session");
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: target.id } })).verificationStatus).toBe("REJECTED");
  });

  it("refuses to resolve a beneficiary without an open exception", async () => {
    const { resolveException } = await import("@/lib/beneficiary-service");
    const ok = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "NOT_STARTED" } });
    await expect(resolveException(admin, ok.id, "CLEARED", "note")).rejects.toThrow(/exception/i);
  });
});

describe("verification queue", () => {
  it("lists cases awaiting review with confidence and warnings, excluding duplicate exceptions", async () => {
    const { getVerificationQueue } = await import("@/lib/verification-queue");
    const queue = await getVerificationQueue();
    const statuses = new Set(queue.map((c) => c.verificationStatus));
    expect([...statuses].every((s) => ["DOCUMENT_SUBMITTED", "EXTRACTED", "REVIEW_PENDING", "EXCEPTION"].includes(s))).toBe(true);
    expect(queue.some((c) => c.verificationStatus === "VERIFIED")).toBe(false);
    expect(queue.some((c) => c.exceptionType === "DUPLICATE_SCHOLARSHIP")).toBe(false);
  });

  it("flags low confidence, name mismatch, unreadable and not-yet-extracted cases", async () => {
    const { getVerificationQueue } = await import("@/lib/verification-queue");
    const queue = await getVerificationQueue();
    const text = (c: (typeof queue)[number]) => c.warnings.join(" | ").toLowerCase();
    expect(queue.some((c) => text(c).includes("low confidence"))).toBe(true);
    expect(queue.some((c) => text(c).includes("differs"))).toBe(true);
    expect(queue.some((c) => text(c).includes("unreadable"))).toBe(true);
    expect(queue.some((c) => text(c).includes("not yet been run"))).toBe(true);
  });

  it("orders cases that most need attention first (warnings before clean cases)", async () => {
    const { getVerificationQueue } = await import("@/lib/verification-queue");
    const queue = await getVerificationQueue();
    const counts = queue.map((c) => c.warnings.length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});
