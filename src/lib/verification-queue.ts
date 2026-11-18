import { db } from "@/lib/db";

export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export async function getVerificationQueue() {
  const people = await db.beneficiary.findMany({
    where: {
      verificationStatus: { in: ["DOCUMENT_SUBMITTED", "EXTRACTED", "REVIEW_PENDING", "EXCEPTION"] },
      // NULL-safe: a plain NOT would also drop rows whose exceptionType is NULL.
      OR: [{ exceptionType: null }, { exceptionType: { not: "DUPLICATE_SCHOLARSHIP" } }],
    },
    include: {
      university: true,
      submissions: { include: { fields: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const cases = people.map((b) => {
    const sub = b.submissions[0] ?? null;
    const warnings: string[] = [];
    if (b.exceptionType === "UNREADABLE_DOCUMENT") warnings.push("Document unreadable: a clearer copy has been requested.");
    if (sub && sub.status === "UPLOADED") warnings.push("AI extraction has not yet been run for this document.");
    if (sub?.extractionConfidence != null && sub.extractionConfidence > 0 && sub.extractionConfidence < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push(`Low confidence (${Math.round(sub.extractionConfidence * 100)}%): check every field against the document.`);
    }
    for (const f of sub?.fields ?? []) if (f.warning) warnings.push(f.warning);

    return {
      beneficiaryId: b.id,
      fullName: b.fullName,
      universityShortName: b.university.shortName,
      universityName: b.university.name,
      verificationStatus: b.verificationStatus,
      exceptionType: b.exceptionType,
      submissionId: sub?.id ?? null,
      documentName: sub?.documentName ?? null,
      documentType: sub?.documentType ?? null,
      submissionStatus: sub?.status ?? null,
      confidence: sub?.extractionConfidence ?? null,
      warnings,
      lastActivityAt: b.lastActivityAt,
    };
  });

  return cases.sort((a, b) => b.warnings.length - a.warnings.length || b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

export type QueueCase = Awaited<ReturnType<typeof getVerificationQueue>>[number];
