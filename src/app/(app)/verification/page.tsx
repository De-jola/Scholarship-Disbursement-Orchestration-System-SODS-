import Link from "next/link";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/status-badge";
import { getVerificationQueue } from "@/lib/verification-queue";
import { paginate, parsePage } from "@/lib/pagination";
import { formatPercent, humanize } from "@/lib/format";

const PAGE_SIZE = 8;

export default async function VerificationQueuePage({ searchParams }: { searchParams: { page?: string } }) {
  const queue = await getVerificationQueue();
  const info = paginate(queue.length, parsePage(searchParams.page), PAGE_SIZE);
  const visible = queue.slice(info.skip, info.skip + info.take);

  return (
    <>
      <PageHeader
        title="Verification queue"
        description="Result documents awaiting human review. AI-assisted extraction proposes values; a reviewer must confirm, correct or reject before a beneficiary can be verified."
      />
      {queue.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheck} title="The verification queue is clear" description="No result documents are waiting for review." /></Card>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Cases awaiting review">
            {visible.map((c) => (
              <li key={c.beneficiaryId}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-navy-900">{c.fullName}</h2>
                      <p className="text-sm text-slate-600">{c.universityName}</p>
                    </div>
                    <StatusBadge kind="verification" value={c.verificationStatus} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-slate-500">Submitted document</dt><dd>{c.documentName ?? "No document on file"}{c.documentType && <span className="block text-xs text-slate-500">{humanize(c.documentType)}</span>}</dd></div>
                    <div>
                      <dt className="text-xs text-slate-500">Extraction confidence</dt>
                      <dd>{c.confidence != null && c.confidence > 0 ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-20 rounded bg-slate-200" role="img" aria-label={`Confidence ${formatPercent(c.confidence)}`}>
                            <span className={`block h-1.5 rounded ${c.confidence >= 0.8 ? "bg-brand" : "bg-red-500"}`} style={{ width: `${Math.round(c.confidence * 100)}%` }} />
                          </span>{formatPercent(c.confidence)}
                        </span>
                      ) : <span className="text-slate-500">Not available</span>}</dd>
                    </div>
                  </dl>
                  {c.warnings.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {c.warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{w}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-3"><Badge tone="success">No warnings</Badge></p>}
                  <div className="mt-4 flex justify-end">
                    <Link href={`/verification/${c.beneficiaryId}`} className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700">
                      Open reviewer
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <Pagination info={info} basePath="/verification" params={{}} noun="cases" />
          </div>
        </>
      )}
    </>
  );
}
