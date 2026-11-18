import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { Session } from "@/lib/session";

type Actor = Pick<Session, "userId" | "name" | "role">;

/** Beneficiary declares another scholarship: raises an exception that blocks automatic batching. */
export async function declareDuplicateScholarship(actor: Actor, beneficiaryId: string, note: string) {
  const b = await db.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId } });
  if (b.exceptionType === "DUPLICATE_SCHOLARSHIP" && !b.exceptionResolvedAt) {
    throw new Error("A duplicate-scholarship exception is already open for this beneficiary.");
  }
  await db.$transaction([
    db.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        otherScholarshipDeclaration: true, verificationStatus: "EXCEPTION", exceptionType: "DUPLICATE_SCHOLARSHIP",
        exceptionNote: note.trim() || "Beneficiary declared another scholarship.", exceptionResolvedAt: null, lastActivityAt: new Date(),
      },
    }),
    db.verificationEvent.create({
      data: { beneficiaryId, eventType: "DUPLICATE_FLAGGED", actorType: actor.role, actorName: actor.name, details: `Duplicate scholarship declared: beneficiary excluded from automatic batching. ${note.trim()}`.trim() },
    }),
  ]);
  await logAudit(actor, "EXCEPTION_RAISED", "Beneficiary", `Duplicate scholarship declared by ${b.fullName}; excluded from payment batches until resolved`,
    { entityId: b.id, beneficiaryId: b.id, universityId: b.universityId });
}

/** Administrator resolves an open exception. A note is mandatory. */
export async function resolveException(actor: Actor, beneficiaryId: string, outcome: "CLEARED" | "REJECTED", note: string) {
  if (!note.trim()) throw new Error("A resolution note is required.");
  const b = await db.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId }, include: { submissions: true } });
  if (b.verificationStatus !== "EXCEPTION" || b.exceptionResolvedAt) {
    throw new Error("This beneficiary has no open exception to resolve.");
  }
  const hasApprovedDoc = b.submissions.some((s) => s.status === "APPROVED");
  const next = outcome === "REJECTED" ? "REJECTED" : hasApprovedDoc ? "VERIFIED" : "NOT_STARTED";

  await db.$transaction([
    db.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        verificationStatus: next, exceptionResolvedAt: new Date(), exceptionNote: note.trim(), lastActivityAt: new Date(),
        verifiedAt: next === "VERIFIED" ? new Date() : b.verifiedAt,
      },
    }),
    db.verificationEvent.create({
      data: {
        beneficiaryId, eventType: outcome === "REJECTED" ? "REJECTED" : "APPROVED", actorType: actor.role, actorName: actor.name,
        details: `Exception ${outcome === "REJECTED" ? "confirmed; beneficiary rejected" : "cleared"}: ${note.trim()}`,
      },
    }),
  ]);
  await logAudit(actor, "EXCEPTION_RESOLVED", "Beneficiary",
    `Exception for ${b.fullName} ${outcome === "REJECTED" ? "confirmed and beneficiary rejected" : "cleared"}: ${note.trim()}`,
    { entityId: b.id, beneficiaryId: b.id, universityId: b.universityId });
}
