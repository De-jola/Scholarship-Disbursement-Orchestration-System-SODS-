import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileX } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DocumentPreview } from "@/components/verification/document-preview";
import { ReviewPanel } from "@/components/verification/review-panel";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const b = await db.beneficiary.findUnique({
    where: { id: params.id },
    include: { university: true, submissions: { include: { fields: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!b) notFound();
  const sub = b.submissions[0];
  const order = ["studentName", "matricNumber", "university", "department", "level", "academicSession", "cgpa", "academicStatus", "resultDate", "documentType"];
  const fields = (sub?.fields ?? []).slice().sort((x, y) => order.indexOf(x.fieldName) - order.indexOf(y.fieldName));
  // The preview always shows the ORIGINAL extracted values, so reviewers compare against the "document".
  const values = Object.fromEntries(fields.map((f) => [f.fieldName, f.extractedValue]));

  return (
    <>
      <Link href="/verification" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-navy-900"><ArrowLeft className="h-4 w-4" aria-hidden />Back to verification queue</Link>
      <PageHeader
        title={`Review: ${b.fullName}`}
        description={`${b.university.name} · ${b.department} · ${b.matricNumber}`}
        actions={<StatusBadge kind="verification" value={b.verificationStatus} />}
      />
      {!sub ? (
        <Card><EmptyState icon={FileX} title="No result document submitted" description="This beneficiary has not uploaded a result document yet." /></Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section aria-label="Uploaded document">
            <h2 className="mb-2 text-sm font-semibold text-navy-900">Uploaded document (simulated preview)</h2>
            {sub.status === "UPLOADED" || fields.length === 0 ? (
              <Card><EmptyState icon={FileX} title={sub.status === "UPLOADED" ? "Preview available after extraction" : "Document could not be read"} description={sub.reviewerNotes ?? "Run AI-assisted extraction to populate the preview and the extracted fields."} /></Card>
            ) : (
              <DocumentPreview universityName={b.university.name} documentName={sub.documentName} documentType={sub.documentType} values={values} />
            )}
            {sub.reviewerNotes && <p className="mt-3 rounded bg-slate-100 p-3 text-sm text-slate-700">Reviewer note: {sub.reviewerNotes}</p>}
          </section>
          <section aria-label="Extracted fields">
            <h2 className="mb-2 text-sm font-semibold text-navy-900">Extracted fields</h2>
            <ReviewPanel
              submissionId={sub.id} submissionStatus={sub.status} confidence={sub.extractionConfidence}
              canReview={can(session.role, "verification.review")}
              fields={fields.map((f) => ({ id: f.id, fieldName: f.fieldName, extractedValue: f.extractedValue, confidence: f.confidence, warning: f.warning, status: f.status, reviewerCorrectedValue: f.reviewerCorrectedValue }))}
            />
          </section>
        </div>
      )}
    </>
  );
}
