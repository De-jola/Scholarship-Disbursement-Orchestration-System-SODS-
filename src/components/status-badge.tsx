import { Badge, type Tone } from "@/components/ui/badge";

interface Entry {
  label: string;
  tone: Tone;
}

const VERIFICATION: Record<string, Entry> = {
  NOT_STARTED: { label: "Verification not started", tone: "neutral" },
  AWAITING_RESULT: { label: "Awaiting result", tone: "info" },
  DOCUMENT_SUBMITTED: { label: "Document submitted", tone: "info" },
  EXTRACTED: { label: "AI extraction complete", tone: "navy" },
  REVIEW_PENDING: { label: "Human review required", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "success" },
  EXCEPTION: { label: "Exception — manual review required", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

const CALENDAR: Record<string, Entry> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "Awaiting calendar approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

const BATCH: Record<string, Entry> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Batch awaiting finance approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "info" },
  DISBURSEMENT_SIMULATED: { label: "Simulated disbursement complete", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const ITEM: Record<string, Entry> = {
  PENDING: { label: "Pending", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "info" },
  DISBURSEMENT_SIMULATED: { label: "Paid (simulated)", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
};

const MAPS = { verification: VERIFICATION, calendar: CALENDAR, batch: BATCH, item: ITEM };

export function statusLabel(kind: keyof typeof MAPS, value: string): string {
  return MAPS[kind][value]?.label ?? value;
}

export function StatusBadge({ kind, value }: { kind: keyof typeof MAPS; value: string }) {
  const e = MAPS[kind][value] ?? { label: value, tone: "neutral" as Tone };
  return <Badge tone={e.tone}>{e.label}</Badge>;
}
