"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { useAction } from "@/components/ui/use-action";
import { declareDuplicateAction, resolveExceptionAction } from "@/app/actions/beneficiaries";
import { formatDate, formatDateTime, formatNaira, formatPercent, humanize } from "@/lib/format";
import type { BeneficiaryDetail } from "@/lib/beneficiaries";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 pb-5 last:border-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm text-slate-800">{v}</dd></div>;
}

export function BeneficiaryDrawer({ detail, canResolve }: { detail: BeneficiaryDetail | null; canResolve: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useAction();
  const [note, setNote] = useState("");

  const close = () => {
    const p = new URLSearchParams(params.toString());
    p.delete("selected");
    router.push(`/beneficiaries${p.size ? `?${p}` : ""}`);
  };
  if (!detail) return null;

  const openException = detail.verificationStatus === "EXCEPTION" && !detail.exceptionResolvedAt;
  const latest = detail.submissions[0];

  return (
    <Modal open onClose={close} variant="drawer" title={detail.fullName} description={`${detail.applicationRef} · ${detail.universityName}`}>
      <div className="space-y-5">
        <Section title="Profile">
          <dl className="grid grid-cols-2 gap-3">
            <Row k="Department" v={detail.department} />
            <Row k="Level" v={detail.level} />
            <Row k="Matric number" v={detail.matricNumber} />
            <Row k="Academic session" v={detail.academicSession} />
            <Row k="E-mail (synthetic)" v={detail.email} />
            <Row k="Phone (synthetic)" v={detail.phone} />
            <Row k="Bank account" v={<>{detail.bankAccountMasked} {detail.hasBankToken ? <Badge tone="success">Token on file</Badge> : <Badge tone="danger">Bank token missing</Badge>}</>} />
            <Row k="Scholarship status" v={humanize(detail.scholarshipStatus)} />
            <Row k="Verification" v={<StatusBadge kind="verification" value={detail.verificationStatus} />} />
          </dl>
        </Section>

        <Section title="University and academic calendar">
          {detail.calendar ? (
            <dl className="grid grid-cols-2 gap-3">
              <Row k="Calendar status" v={<StatusBadge kind="calendar" value={detail.calendar.reviewStatus} />} />
              <Row k="Registration window" v={detail.calendar.registrationStart ? `${formatDate(detail.calendar.registrationStart)} – ${formatDate(detail.calendar.registrationEnd)}` : "Not specified"} />
            </dl>
          ) : <p className="text-sm text-slate-600">No calendar on file. Payments cannot be batched until a calendar is approved.</p>}
        </Section>

        <Section title="Duplicate-scholarship declaration">
          {detail.otherScholarshipDeclaration ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <Badge tone="danger">Duplicate scholarship declared</Badge>
              <p className="mt-1">{detail.exceptionNote ?? "Another scholarship was declared."}</p>
              {detail.exceptionResolvedAt && <p className="mt-1 text-xs">Resolved {formatDate(detail.exceptionResolvedAt)}.</p>}
            </div>
          ) : <p className="text-sm text-slate-600">No other scholarship has been declared.</p>}
        </Section>

        <Section title="Verification timeline">
          {detail.timeline.length === 0 ? <p className="text-sm text-slate-600">No verification activity yet.</p> : (
            <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
              {detail.timeline.map((e) => (
                <li key={e.id}>
                  <p className="text-sm text-slate-800">{e.details}</p>
                  <p className="text-xs text-slate-500">{humanize(e.eventType)} · {e.actorName} · {formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Uploaded result documents">
          {detail.submissions.length === 0 ? <p className="text-sm text-slate-600">No result document has been submitted.</p> : (
            <ul className="space-y-1.5">
              {detail.submissions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>{s.documentName} <span className="text-xs text-slate-500">({humanize(s.documentType)})</span></span>
                  <span className="flex items-center gap-2"><Badge tone="navy">{humanize(s.status)}</Badge>{s.extractionConfidence != null && <span className="text-xs">{formatPercent(s.extractionConfidence)}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Extracted fields (latest document)">
          {!latest || latest.fields.length === 0 ? <p className="text-sm text-slate-600">No fields have been extracted.</p> : (
            <>
              <p className="mb-2 text-xs font-medium text-brand-dark">AI-assisted extraction — human approval required.</p>
              <table className="w-full text-sm">
                <thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col">Confidence</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {latest.fields.map((f) => (
                    <tr key={f.id}>
                      <td>{humanize(f.fieldName.replace(/([A-Z])/g, " $1"))}</td>
                      <td>{f.reviewerCorrectedValue ?? f.extractedValue}{f.warning && <p className="text-xs text-amber-700">{f.warning}</p>}</td>
                      <td>{formatPercent(f.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        <Section title="Payment history">
          {detail.payments.length === 0 ? <p className="text-sm text-slate-600">No payments have been scheduled for this beneficiary.</p> : (
            <ul className="space-y-1.5">
              {detail.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>{p.batchName}<br /><span className="text-xs text-slate-500">{p.paymentReference ?? "Reference assigned on approval"}</span></span>
                  <span className="flex items-center gap-2">{formatNaira(p.amount)}<StatusBadge kind="item" value={p.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Actions">
          {!canResolve ? (
            <p className="text-sm text-slate-600">Your role has read-only access to beneficiary records. Exceptions are resolved by a Scholarship Administrator.</p>
          ) : (
            <div className="space-y-3">
              <label htmlFor="exc-note" className="label">{openException ? "Resolution note (required)" : "Note for the record"}</label>
              <textarea id="exc-note" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {openException ? (
                  <>
                    <Button variant="success" disabled={pending || !note.trim()} onClick={() => run(() => resolveExceptionAction(detail.id, "CLEARED", note), (r) => r.ok && setNote(""))}>Clear exception</Button>
                    <Button variant="danger" disabled={pending || !note.trim()} onClick={() => run(() => resolveExceptionAction(detail.id, "REJECTED", note), (r) => r.ok && setNote(""))}>Confirm and reject beneficiary</Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={pending || detail.verificationStatus === "REJECTED"} onClick={() => run(() => declareDuplicateAction(detail.id, note), (r) => r.ok && setNote(""))}>
                    Record duplicate-scholarship declaration
                  </Button>
                )}
              </div>
            </div>
          )}
        </Section>
      </div>
    </Modal>
  );
}
