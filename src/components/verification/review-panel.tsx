"use client";

import { useState } from "react";
import { AlertTriangle, Check, FileSearch, Flag, Pencil, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/ui/use-action";
import {
  approveVerificationAction, clearerCopyAction, confirmFieldAction, correctFieldAction,
  markExceptionAction, rejectVerificationAction, runExtractionAction,
} from "@/app/actions/verification";
import { AI_LABEL, FIELD_LABELS } from "@/lib/extraction";
import { formatPercent } from "@/lib/format";

export interface PanelField {
  id: string;
  fieldName: string;
  extractedValue: string;
  confidence: number;
  warning: string | null;
  status: string;
  reviewerCorrectedValue: string | null;
}

interface Props {
  submissionId: string;
  submissionStatus: string;
  confidence: number | null;
  fields: PanelField[];
  canReview: boolean;
}

type NoteAction = "reject" | "exception" | "clearer" | null;
const NOTE_COPY = {
  reject: { title: "Reject verification", cta: "Reject verification", required: true, help: "Explain why this submission cannot be accepted. A rejected verification prevents payment." },
  exception: { title: "Mark exception", cta: "Mark exception", required: true, help: "Describe the issue. The beneficiary will be excluded from automatic batching until an administrator resolves it." },
  clearer: { title: "Request clearer document", cta: "Request clearer copy", required: false, help: "Tell the beneficiary what is unclear. They return to awaiting result." },
} as const;

function FieldRow({ f, canReview }: { f: PanelField; canReview: boolean }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(f.reviewerCorrectedValue ?? f.extractedValue);
  const effective = f.reviewerCorrectedValue ?? f.extractedValue;
  const dirty = value.trim() !== effective;
  const bar = f.confidence >= 0.8 ? "bg-brand" : "bg-red-500";
  const tone = f.status === "CONFIRMED" ? "success" : f.status === "CORRECTED" ? "info" : "warning";
  const label = f.status === "CONFIRMED" ? "Confirmed" : f.status === "CORRECTED" ? "Corrected" : "Not yet reviewed";

  return (
    <li className={`rounded-md border p-3 ${f.warning ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`f-${f.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">{FIELD_LABELS[f.fieldName] ?? f.fieldName}</label>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <input id={`f-${f.id}`} className="field mt-1.5 font-mono" value={value} disabled={!canReview || pending} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
        <span className="h-1.5 w-16 rounded bg-slate-200" role="img" aria-label={`Confidence ${formatPercent(f.confidence)}`}>
          <span className={`block h-1.5 rounded ${bar}`} style={{ width: `${Math.round(f.confidence * 100)}%` }} />
        </span>
        {formatPercent(f.confidence)} extraction confidence
      </div>
      {f.warning && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{f.warning}</p>}
      {canReview && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={pending || !dirty || !value.trim()} onClick={() => run(() => correctFieldAction(f.id, value))}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />Correct field
          </Button>
          <Button size="sm" variant="secondary" disabled={pending || dirty || f.status === "CONFIRMED"} onClick={() => run(() => confirmFieldAction(f.id))}>
            <Check className="h-3.5 w-3.5" aria-hidden />Confirm field
          </Button>
        </div>
      )}
    </li>
  );
}

export function ReviewPanel({ submissionId, submissionStatus, confidence, fields, canReview }: Props) {
  const { run, pending } = useAction();
  const [noteAction, setNoteAction] = useState<NoteAction>(null);
  const [note, setNote] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const reviewable = submissionStatus === "REVIEW_PENDING" || submissionStatus === "EXTRACTED";
  const remaining = fields.filter((f) => f.status === "PENDING").length;
  const copy = noteAction ? NOTE_COPY[noteAction] : null;

  function submitNote() {
    if (!noteAction) return;
    const fn = noteAction === "reject" ? rejectVerificationAction : noteAction === "exception" ? markExceptionAction : clearerCopyAction;
    run(() => fn(submissionId, note), (r) => { if (r.ok) { setNoteAction(null); setNote(""); } });
  }

  if (submissionStatus === "UPLOADED") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <FileSearch className="mx-auto h-8 w-8 text-navy-500" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-navy-900">AI extraction has not yet been run</p>
        <p className="mt-1 text-sm text-slate-600">Run the simulated OCR and language-model extraction. Results are suggestions only and need human approval.</p>
        {canReview && <Button className="mt-4" disabled={pending} onClick={() => run(() => runExtractionAction(submissionId))}>{pending ? "Extracting fields from the document…" : "Run AI-assisted extraction"}</Button>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="rounded bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700">{AI_LABEL}</p>
        {confidence != null && <span className="text-xs text-slate-600">Overall confidence <strong>{formatPercent(confidence)}</strong></span>}
      </div>

      {fields.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">No fields were extracted from this document.</p>
      ) : (
        <ul className="space-y-3" aria-label="Extracted fields">{fields.map((f) => <FieldRow key={f.id + f.status + (f.reviewerCorrectedValue ?? "")} f={f} canReview={canReview && reviewable} />)}</ul>
      )}

      {!canReview && <p className="mt-4 rounded bg-slate-100 p-3 text-sm text-slate-700">Review actions are available to Scholarship Administrators only.</p>}

      {canReview && reviewable && (
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
          <div>
            <label htmlFor="approve-note" className="label">Reviewer note (optional for approval)</label>
            <input id="approve-note" className="field" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
          </div>
          <p className="text-xs text-slate-600">{remaining > 0 ? `${remaining} field${remaining === 1 ? "" : "s"} still need to be confirmed or corrected before approval.` : "All fields have been reviewed."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNoteAction("clearer")}><Undo2 className="h-3.5 w-3.5" aria-hidden />Request clearer document</Button>
            <Button variant="secondary" size="sm" onClick={() => setNoteAction("exception")}><Flag className="h-3.5 w-3.5" aria-hidden />Mark exception</Button>
            <Button variant="danger" size="sm" onClick={() => setNoteAction("reject")}><ThumbsDown className="h-3.5 w-3.5" aria-hidden />Reject verification</Button>
            <Button variant="success" size="sm" disabled={pending || remaining > 0} onClick={() => run(() => approveVerificationAction(submissionId, approveNote))}>
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden />{pending ? "Approving verification…" : "Approve verification"}
            </Button>
          </div>
        </div>
      )}

      <Modal open={!!noteAction} onClose={() => setNoteAction(null)} title={copy?.title ?? ""} description={copy?.help}
        footer={<>
          <Button variant="secondary" onClick={() => setNoteAction(null)}>Cancel</Button>
          <Button variant={noteAction === "reject" ? "danger" : "primary"} disabled={pending || (!!copy?.required && !note.trim())} onClick={submitNote}>{copy?.cta}</Button>
        </>}>
        <label htmlFor="review-note" className="label">{copy?.required ? "Reviewer note (required)" : "Note"}</label>
        <textarea id="review-note" className="field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}
