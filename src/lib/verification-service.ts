import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { LOW_CONFIDENCE, simulateExtraction, validateExtraction, type FieldInput, type PersonRecord } from "@/lib/extraction";
import { extractResultFields, hasUsableText } from "@/lib/result-text";
import type { Session } from "@/lib/session";

type Actor = Pick<Session, "userId" | "name" | "role">;
type DocType = "STATEMENT_OF_RESULT" | "TRANSCRIPT" | "COURSE_REGISTRATION_FORM";

const event = (beneficiaryId: string, actor: Actor, eventType: string, details: string) =>
  db.verificationEvent.create({ data: { beneficiaryId, eventType: eventType as never, actorType: actor.role, actorName: actor.name, details } });

const systemEvent = (beneficiaryId: string, eventType: string, details: string) =>
  db.verificationEvent.create({ data: { beneficiaryId, eventType: eventType as never, actorType: "SYSTEM", actorName: "Simulated extraction", details } });

function person(b: { fullName: string; matricNumber: string; department: string; level: string; university: { name: string } }): PersonRecord {
  return { fullName: b.fullName, matricNumber: b.matricNumber, universityName: b.university.name, department: b.department, level: b.level };
}

/** Beneficiary (or administrator on their behalf) submits a result document, e.g. when the university portal is late. */
export async function submitResultDocument(actor: Actor, beneficiaryId: string, documentName: string, documentType: DocType, opts: { rawText?: string | null } = {}) {
  const b = await db.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId } });
  const resubmission = b.verificationStatus === "EXCEPTION" && b.exceptionType === "UNREADABLE_DOCUMENT";
  if (!["NOT_STARTED", "AWAITING_RESULT"].includes(b.verificationStatus) && !resubmission) {
    throw new Error("A result document can only be submitted while verification has not started, a result is awaited, or a clearer copy was requested.");
  }
  const name = documentName.trim();
  if (!name) throw new Error("Enter a document name.");

  const sub = await db.resultSubmission.create({
    data: { beneficiaryId, documentName: name, documentType, fileUrl: `/simulated-uploads/${b.applicationRef}-${name}`, status: "UPLOADED", rawText: opts.rawText ?? null },
  });
  await db.beneficiary.update({
    where: { id: beneficiaryId },
    data: { verificationStatus: "DOCUMENT_SUBMITTED", exceptionType: null, exceptionNote: null, exceptionResolvedAt: null, lastActivityAt: new Date() },
  });
  await event(beneficiaryId, actor, "DOCUMENT_UPLOADED", `Uploaded ${name}; AI-assisted extraction has not yet been run`);
  await logAudit(actor, "DOCUMENT_UPLOADED", "ResultSubmission", `Result document ${name} submitted for ${b.fullName}`,
    { entityId: sub.id, beneficiaryId, universityId: b.universityId });
  return sub;
}

/** Simulated OCR + LLM extraction. Stores fields and warnings; never verifies anyone. */
export async function runExtraction(actor: Actor, submissionId: string) {
  const sub = await db.resultSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { beneficiary: { include: { university: true } } } });
  if (sub.status !== "UPLOADED") throw new Error("Extraction has already been run for this document.");
  const b = sub.beneficiary;
  const p = person(b);
  // Uploaded files are read for their own text; a null rawText means a simulated demo sample.
  const result = sub.rawText === null
    ? simulateExtraction({ documentType: sub.documentType, documentName: sub.documentName, person: p })
    : hasUsableText(sub.rawText)
      ? extractResultFields(sub.rawText, sub.documentType)
      : { fields: [], confidence: 0.1, unreadable: true };

  if (result.unreadable) {
    await db.$transaction([
      db.resultSubmission.update({ where: { id: sub.id }, data: { status: "REJECTED", extractionConfidence: result.confidence, reviewerNotes: "Document unreadable: a clearer copy is required." } }),
      db.beneficiary.update({
        where: { id: b.id },
        data: { verificationStatus: "EXCEPTION", exceptionType: "UNREADABLE_DOCUMENT", exceptionNote: "The uploaded document could not be read. A clearer copy is required.", exceptionResolvedAt: null, lastActivityAt: new Date() },
      }),
    ]);
    await systemEvent(b.id, "EXCEPTION_RAISED", "Document unreadable: extraction produced no usable fields. Exception raised; clearer copy required");
    await logAudit({ name: "Simulated extraction", role: "SYSTEM" }, "AI_EXTRACTION", "ResultSubmission",
      `AI-assisted extraction could not read ${sub.documentName} for ${b.fullName}`, { entityId: sub.id, beneficiaryId: b.id, universityId: b.universityId });
    return;
  }

  const warnings = validateExtraction(result.fields, p);
  const needsReview = warnings.length > 0 || result.confidence < LOW_CONFIDENCE;
  const status = needsReview ? "REVIEW_PENDING" : "EXTRACTED";

  await db.$transaction([
    db.resultSubmission.update({
      where: { id: sub.id },
      data: {
        status, extractionConfidence: result.confidence,
        extractedJson: JSON.stringify(Object.fromEntries(result.fields.map((f) => [f.fieldName, f.value]))),
        fields: {
          create: result.fields.map((f) => {
            const w = warnings.find((x) => x.fieldName === f.fieldName);
            return { fieldName: f.fieldName, extractedValue: f.value, confidence: f.confidence, needsReview: !!w || f.confidence < LOW_CONFIDENCE, warning: w?.message ?? null };
          }),
        },
      },
    }),
    db.beneficiary.update({ where: { id: b.id }, data: { verificationStatus: status, lastActivityAt: new Date() } }),
  ]);
  await systemEvent(b.id, "AI_EXTRACTION_COMPLETED",
    `AI-assisted extraction complete (confidence ${Math.round(result.confidence * 100)}%, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}): human review required`);
  await logAudit({ name: "Simulated extraction", role: "SYSTEM" }, "AI_EXTRACTION", "ResultSubmission",
    `AI-assisted extraction of ${sub.documentName} for ${b.fullName}: confidence ${Math.round(result.confidence * 100)}%, ${warnings.length} warning(s)`,
    { entityId: sub.id, beneficiaryId: b.id, universityId: b.universityId });
}

async function loadField(fieldId: string) {
  const f = await db.extractedField.findUniqueOrThrow({
    where: { id: fieldId },
    include: { submission: { include: { beneficiary: { include: { university: true } } } } },
  });
  if (!["REVIEW_PENDING", "EXTRACTED"].includes(f.submission.status)) throw new Error("This document is no longer awaiting review.");
  return f;
}

/** Recomputes warnings for every field using reviewer-corrected values (corrections count as fully confident). */
async function revalidate(submissionId: string) {
  const sub = await db.resultSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { fields: true, beneficiary: { include: { university: true } } } });
  const inputs: FieldInput[] = sub.fields.map((f) => ({
    fieldName: f.fieldName,
    value: f.reviewerCorrectedValue ?? f.extractedValue,
    confidence: f.status === "CORRECTED" ? 1 : f.confidence,
  }));
  const warnings = validateExtraction(inputs, person(sub.beneficiary));
  await db.$transaction(sub.fields.map((f) => {
    const w = warnings.find((x) => x.fieldName === f.fieldName);
    return db.extractedField.update({ where: { id: f.id }, data: { warning: w?.message ?? null, needsReview: !!w } });
  }));
  return warnings;
}

export async function confirmField(actor: Actor, fieldId: string) {
  const f = await loadField(fieldId);
  await db.extractedField.update({ where: { id: fieldId }, data: { status: "CONFIRMED" } });
  await logAudit(actor, "FIELD_CORRECTED", "ExtractedField", `Confirmed ${f.fieldName} for ${f.submission.beneficiary.fullName}`,
    { entityId: f.id, beneficiaryId: f.submission.beneficiaryId, universityId: f.submission.beneficiary.universityId });
}

export async function correctField(actor: Actor, fieldId: string, value: string) {
  const f = await loadField(fieldId);
  const v = value.trim();
  if (!v) throw new Error("Enter the corrected value.");
  await db.extractedField.update({ where: { id: fieldId }, data: { status: "CORRECTED", reviewerCorrectedValue: v } });
  await revalidate(f.resultSubmissionId);
  const b = f.submission.beneficiary;
  await event(b.id, actor, "FIELD_CORRECTED", `Corrected ${f.fieldName} from "${f.extractedValue}" to "${v}"`);
  await logAudit(actor, "FIELD_CORRECTED", "ExtractedField", `Corrected ${f.fieldName} for ${b.fullName}: "${f.extractedValue}" → "${v}"`,
    { entityId: f.id, beneficiaryId: b.id, universityId: b.universityId });
}

async function loadReviewable(submissionId: string) {
  const sub = await db.resultSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { fields: true, beneficiary: true } });
  return sub;
}

export async function approveVerification(actor: Actor, submissionId: string, notes?: string) {
  const sub = await loadReviewable(submissionId);
  const b = sub.beneficiary;
  if (b.verificationStatus === "EXCEPTION" && !b.exceptionResolvedAt) {
    throw new Error("This beneficiary has an open exception. Resolve the exception before verification can be approved.");
  }
  if (!["REVIEW_PENDING", "EXTRACTED"].includes(sub.status)) throw new Error("This document is not awaiting review.");
  if (sub.fields.some((f) => f.status === "PENDING")) {
    throw new Error("Review every extracted field (confirm or correct) before approving verification.");
  }
  const warnings = (await revalidate(sub.id)).filter((w) => !/^Low confidence/.test(w.message));
  if (warnings.length) {
    throw new Error(`Resolve the validation warnings before approving: ${warnings.map((w) => w.fieldName).join(", ")}.`);
  }
  const now = new Date();
  await db.$transaction([
    db.resultSubmission.update({ where: { id: sub.id }, data: { status: "APPROVED", reviewerId: actor.userId, reviewedAt: now, reviewerNotes: notes?.trim() || null } }),
    db.beneficiary.update({ where: { id: b.id }, data: { verificationStatus: "VERIFIED", verifiedAt: now, lastActivityAt: now } }),
  ]);
  await event(b.id, actor, "APPROVED", `Verification approved after human review${notes?.trim() ? `: ${notes.trim()}` : ""}`);
  await logAudit(actor, "VERIFICATION_APPROVED", "ResultSubmission", `Verification approved for ${b.fullName}`,
    { entityId: sub.id, beneficiaryId: b.id, universityId: b.universityId });
}

export async function rejectVerification(actor: Actor, submissionId: string, note: string) {
  if (!note.trim()) throw new Error("A reviewer note is required to reject a verification.");
  const sub = await loadReviewable(submissionId);
  const b = sub.beneficiary;
  await db.$transaction([
    db.resultSubmission.update({ where: { id: sub.id }, data: { status: "REJECTED", reviewerId: actor.userId, reviewedAt: new Date(), reviewerNotes: note.trim() } }),
    db.beneficiary.update({ where: { id: b.id }, data: { verificationStatus: "REJECTED", lastActivityAt: new Date() } }),
  ]);
  await event(b.id, actor, "REJECTED", `Verification rejected: ${note.trim()}`);
  await logAudit(actor, "VERIFICATION_REJECTED", "ResultSubmission", `Verification rejected for ${b.fullName}: ${note.trim()}`,
    { entityId: sub.id, beneficiaryId: b.id, universityId: b.universityId });
}

export async function markException(actor: Actor, submissionId: string, note: string) {
  if (!note.trim()) throw new Error("A reviewer note is required to mark an exception.");
  const sub = await loadReviewable(submissionId);
  const b = sub.beneficiary;
  await db.beneficiary.update({
    where: { id: b.id },
    data: { verificationStatus: "EXCEPTION", exceptionType: "OTHER", exceptionNote: note.trim(), exceptionResolvedAt: null, lastActivityAt: new Date() },
  });
  await event(b.id, actor, "EXCEPTION_RAISED", `Exception: manual review required. ${note.trim()}`);
  await logAudit(actor, "EXCEPTION_RAISED", "Beneficiary", `Exception raised for ${b.fullName}: ${note.trim()}`,
    { entityId: b.id, beneficiaryId: b.id, universityId: b.universityId });
}

export async function requestClearerCopy(actor: Actor, submissionId: string, note: string) {
  const sub = await loadReviewable(submissionId);
  const b = sub.beneficiary;
  const reason = note.trim() || "The document is not clear enough to verify.";
  await db.$transaction([
    db.resultSubmission.update({ where: { id: sub.id }, data: { status: "REJECTED", reviewerId: actor.userId, reviewedAt: new Date(), reviewerNotes: `Clearer copy requested: ${reason}` } }),
    db.beneficiary.update({ where: { id: b.id }, data: { verificationStatus: "AWAITING_RESULT", lastActivityAt: new Date() } }),
  ]);
  await event(b.id, actor, "EXCEPTION_RAISED", `Clearer document requested: ${reason}`);
  await logAudit(actor, "CLEARER_COPY_REQUESTED", "ResultSubmission", `Clearer copy requested from ${b.fullName}: ${reason}`,
    { entityId: sub.id, beneficiaryId: b.id, universityId: b.universityId });
}
