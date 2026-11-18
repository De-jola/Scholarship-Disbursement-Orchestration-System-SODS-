import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";

let prisma: PrismaClient;
const admin = { userId: "u1", name: "Adaeze Okonkwo", role: "ADMIN" as const, email: "x" };

beforeAll(async () => {
  prisma = await createSeededDb("verification");
}, 120_000);
afterAll(async () => prisma.$disconnect());

const awaiting = (short: string) => prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "AWAITING_RESULT", university: { shortName: short } } });

describe("late portal fallback (scenario 2)", () => {
  it("submitting a document moves the beneficiary to DOCUMENT_SUBMITTED with an event and audit entry", async () => {
    const { submitResultDocument } = await import("@/lib/verification-service");
    const b = await awaiting("DPU");
    const sub = await submitResultDocument(admin, b.id, "prior-statement-of-result-name-mismatch.pdf", "STATEMENT_OF_RESULT");
    expect(sub.status).toBe("UPLOADED");
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } })).verificationStatus).toBe("DOCUMENT_SUBMITTED");
    expect(await prisma.verificationEvent.count({ where: { beneficiaryId: b.id, eventType: "DOCUMENT_UPLOADED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { beneficiaryId: b.id, action: "DOCUMENT_UPLOADED" } })).toBe(1);
  });

  it("extraction stores fields with warnings, flags the name mismatch and moves to REVIEW_PENDING", async () => {
    const { runExtraction } = await import("@/lib/verification-service");
    const b = await awaiting("DPU").catch(() => prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "DOCUMENT_SUBMITTED", university: { shortName: "DPU" } } }));
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { beneficiaryId: b.id } });
    await runExtraction(admin, sub.id);
    const after = await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id }, include: { fields: true } });
    expect(after.status).toBe("REVIEW_PENDING");
    expect(after.fields.length).toBe(10);
    expect(after.fields.find((f) => f.fieldName === "studentName")?.warning).toMatch(/differs/);
    expect(JSON.parse(after.extractedJson!).studentName).toBeTruthy();
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } })).verificationStatus).toBe("REVIEW_PENDING");
    expect(await prisma.auditLog.count({ where: { beneficiaryId: b.id, action: "AI_EXTRACTION" } })).toBe(1);
  });

  it("cannot approve until every field is confirmed or corrected", async () => {
    const { approveVerification } = await import("@/lib/verification-service");
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { status: "REVIEW_PENDING", beneficiary: { university: { shortName: "DPU" } }, fields: { some: { warning: { contains: "differs" } } } } });
    await expect(approveVerification(admin, sub.id)).rejects.toThrow(/every extracted field/i);
  });

  it("cannot approve while a corrected value still fails validation", async () => {
    const { correctField, approveVerification, confirmField } = await import("@/lib/verification-service");
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { status: "REVIEW_PENDING", fields: { some: { warning: { contains: "differs" } } } }, include: { fields: true } });
    const cgpa = sub.fields.find((f) => f.fieldName === "cgpa")!;
    await correctField(admin, cgpa.id, "7.5");
    for (const f of sub.fields.filter((x) => x.id !== cgpa.id)) await confirmField(admin, f.id);
    await expect(approveVerification(admin, sub.id)).rejects.toThrow(/validation|resolve/i);
    await correctField(admin, cgpa.id, "4.05");
  });

  it("correcting the name clears its warning, records an event and lets the reviewer approve", async () => {
    const { correctField, approveVerification } = await import("@/lib/verification-service");
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { status: "REVIEW_PENDING", fields: { some: { warning: { contains: "differs" } } } }, include: { beneficiary: true } });
    const nameField = await prisma.extractedField.findFirstOrThrow({ where: { resultSubmissionId: sub.id, fieldName: "studentName" } });
    await correctField(admin, nameField.id, sub.beneficiary.fullName);
    const fixed = await prisma.extractedField.findUniqueOrThrow({ where: { id: nameField.id } });
    expect(fixed.status).toBe("CORRECTED");
    expect(fixed.reviewerCorrectedValue).toBe(sub.beneficiary.fullName);
    expect(await prisma.verificationEvent.count({ where: { beneficiaryId: sub.beneficiaryId, eventType: "FIELD_CORRECTED" } })).toBeGreaterThanOrEqual(1);

    await approveVerification(admin, sub.id, "Name corrected to match enrolment record");
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: sub.beneficiaryId } })).verificationStatus).toBe("VERIFIED");
    const approved = await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedAt).not.toBeNull();
    expect(await prisma.verificationEvent.count({ where: { beneficiaryId: sub.beneficiaryId, eventType: "APPROVED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { beneficiaryId: sub.beneficiaryId, action: "VERIFICATION_APPROVED" } })).toBe(1);
  });
});

describe("reviewer decisions", () => {
  async function pendingSubmission(short: string) {
    const b = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "REVIEW_PENDING", university: { shortName: short } } });
    return { b, sub: await prisma.resultSubmission.findFirstOrThrow({ where: { beneficiaryId: b.id }, orderBy: { createdAt: "desc" } }) };
  }

  it("requires a note to reject or to mark an exception", async () => {
    const { rejectVerification, markException } = await import("@/lib/verification-service");
    const { sub } = await pendingSubmission("UUS");
    await expect(rejectVerification(admin, sub.id, "")).rejects.toThrow(/note/i);
    await expect(markException(admin, sub.id, "   ")).rejects.toThrow(/note/i);
  });

  it("rejecting prevents verification and records the reason", async () => {
    const { rejectVerification } = await import("@/lib/verification-service");
    const { b, sub } = await pendingSubmission("UUS");
    await rejectVerification(admin, sub.id, "Matric number does not match enrolment list");
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } })).verificationStatus).toBe("REJECTED");
    expect((await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } })).reviewerNotes).toContain("Matric");
    expect(await prisma.auditLog.count({ where: { beneficiaryId: b.id, action: "VERIFICATION_REJECTED" } })).toBe(1);
  });

  it("marking an exception blocks automatic batching and records an exception event", async () => {
    const { markException } = await import("@/lib/verification-service");
    const { b, sub } = await pendingSubmission("UUS");
    await markException(admin, sub.id, "Result date inconsistent with session");
    const after = await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.verificationStatus).toBe("EXCEPTION");
    expect(after.exceptionType).toBe("OTHER");
    expect(await prisma.verificationEvent.count({ where: { beneficiaryId: b.id, eventType: "EXCEPTION_RAISED" } })).toBeGreaterThanOrEqual(1);
  });

  it("requesting a clearer copy returns the beneficiary to AWAITING_RESULT", async () => {
    const { requestClearerCopy } = await import("@/lib/verification-service");
    const { b, sub } = await pendingSubmission("RFU");
    await requestClearerCopy(admin, sub.id, "Bottom half of the page is cut off");
    expect((await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } })).verificationStatus).toBe("AWAITING_RESULT");
    expect(await prisma.auditLog.count({ where: { beneficiaryId: b.id, action: "CLEARER_COPY_REQUESTED" } })).toBe(1);
  });

  it("an unreadable upload raises an UNREADABLE_DOCUMENT exception instead of fields", async () => {
    const { submitResultDocument, runExtraction } = await import("@/lib/verification-service");
    const b = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "AWAITING_RESULT", university: { shortName: "LCU" } } });
    const sub = await submitResultDocument(admin, b.id, "photo-unreadable.pdf", "STATEMENT_OF_RESULT");
    await runExtraction(admin, sub.id);
    const after = await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.verificationStatus).toBe("EXCEPTION");
    expect(after.exceptionType).toBe("UNREADABLE_DOCUMENT");
    expect(await prisma.extractedField.count({ where: { resultSubmissionId: sub.id } })).toBe(0);
  });

  it("will not approve a beneficiary with an open duplicate-scholarship exception", async () => {
    const { approveVerification } = await import("@/lib/verification-service");
    const dup = await prisma.beneficiary.findFirstOrThrow({ where: { exceptionType: "DUPLICATE_SCHOLARSHIP", exceptionResolvedAt: null } });
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { beneficiaryId: dup.id } });
    await expect(approveVerification(admin, sub.id)).rejects.toThrow(/exception/i);
  });
});
