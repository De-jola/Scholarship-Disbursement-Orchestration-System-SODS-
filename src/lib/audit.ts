import { db } from "@/lib/db";

export type AuditAction =
  | "CALENDAR_UPLOADED" | "CALENDAR_EVENT_ADDED" | "CALENDAR_APPROVED" | "CALENDAR_REJECTED"
  | "DOCUMENT_UPLOADED" | "AI_EXTRACTION" | "FIELD_CORRECTED" | "VERIFICATION_APPROVED"
  | "VERIFICATION_REJECTED" | "EXCEPTION_RAISED" | "EXCEPTION_RESOLVED" | "CLEARER_COPY_REQUESTED"
  | "BATCH_CREATED" | "BATCH_UPDATED" | "BATCH_APPROVED" | "DISBURSEMENT_SIMULATED"
  | "PAYMENT_RETRIED" | "PAYMENT_MANUAL_REVIEW" | "FUND_ALLOCATION_CHANGED" | "FUND_ALLOCATION_CREATED"
  | "BATCH_APPROVAL_BLOCKED" | "UNIVERSITY_ACTIVATED";

/** Audit entries are append-only: there is deliberately no update/delete helper. */
export async function logAudit(
  actor: { name: string; role: string },
  action: AuditAction,
  entityType: string,
  details: string,
  refs: { entityId?: string; universityId?: string; beneficiaryId?: string; paymentBatchId?: string } = {},
) {
  await db.auditLog.create({
    data: { actorName: actor.name, actorRole: actor.role, action, entityType, details, ...refs },
  });
}
