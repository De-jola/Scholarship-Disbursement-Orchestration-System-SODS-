"use client";

import { useState } from "react";
import { CalendarX2, Check, Send, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useAction } from "@/components/ui/use-action";
import { approveCalendarAction, rejectCalendarAction, submitCalendarAction } from "@/app/actions/calendars";
import { formatDate, formatDateTime, formatPercent, humanize } from "@/lib/format";
import type { UniversityRow } from "@/lib/universities";

const SOURCE: Record<string, string> = {
  MANUAL_ENTRY: "Manual entry",
  CSV_UPLOAD: "CSV / JSON upload",
  SIMULATED_PORTAL: "Simulated PDF / portal extraction",
};

function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 0.85 ? "bg-brand" : value >= 0.8 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded bg-slate-200" role="img" aria-label={`Confidence ${formatPercent(value)}`}>
        <div className={`h-1.5 rounded ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">{formatPercent(value)}</span>
    </div>
  );
}

export function CalendarDrawer({ open, university, canManage, onClose }: {
  open: boolean; university: UniversityRow | null; canManage: boolean; onClose: () => void;
}) {
  const { run, pending } = useAction();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!university) return null;

  return (
    <Modal open={open} onClose={onClose} variant="drawer" title={`${university.name}: academic calendars`}
      description="AI-assisted extraction: administrator approval required before payments can be batched.">
      {university.calendars.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No calendar on file" description="Upload a calendar file or add events manually to begin. Payments cannot be batched without an approved calendar." />
      ) : (
        <div className="space-y-8">
          {university.calendars.map((c) => {
            const reviewable = c.reviewStatus === "PENDING_REVIEW" || c.reviewStatus === "DRAFT";
            return (
              <section key={c.id} aria-label={`${c.session} calendar from ${c.sourceName}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-navy-900">Session {c.session}</h3>
                  <StatusBadge kind="calendar" value={c.reviewStatus} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-slate-500">Source</dt><dd>{SOURCE[c.sourceType]} — {c.sourceName}</dd></div>
                  <div><dt className="text-xs text-slate-500">Extraction confidence (average)</dt><dd><ConfidenceBar value={c.avgConfidence} /></dd></div>
                  <div><dt className="text-xs text-slate-500">Reviewer</dt><dd>{c.approvedByName ?? "Not yet reviewed"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Approved at</dt><dd>{c.approvedAt ? formatDateTime(c.approvedAt) : "—"}</dd></div>
                </dl>
                {c.reviewNotes && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">Reviewer note: {c.reviewNotes}</p>}

                <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full">
                    <caption className="sr-only">Extracted calendar events for session {c.session}</caption>
                    <thead><tr><th scope="col">Event</th><th scope="col">Dates</th><th scope="col">Confidence</th><th scope="col">Source text</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {c.events.length === 0 ? (
                        <tr><td colSpan={4} className="text-center text-slate-500">No events extracted yet.</td></tr>
                      ) : c.events.map((e) => (
                        <tr key={e.id} className={e.confidence < 0.8 ? "bg-amber-50/60" : undefined}>
                          <td><p className="font-medium">{e.title}</p><Badge tone="navy">{humanize(e.eventType)}</Badge></td>
                          <td className="whitespace-nowrap text-xs">{formatDate(e.startDate)} – {formatDate(e.endDate)}</td>
                          <td><ConfidenceBar value={e.confidence} /></td>
                          <td className="text-xs text-slate-600">{e.sourceText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.events.some((e) => e.confidence < 0.8) && (
                  <p className="mt-2 text-xs text-amber-800">Highlighted rows have confidence below 80% and need careful checking against the source.</p>
                )}

                {canManage && reviewable && (
                  <div className="mt-4 space-y-3">
                    {rejecting === c.id ? (
                      <div>
                        <label htmlFor={`reason-${c.id}`} className="label">Reason for rejection (required)</label>
                        <textarea id={`reason-${c.id}`} className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setRejecting(null)}>Cancel</Button>
                          <Button variant="danger" size="sm" disabled={pending || !reason.trim()}
                            onClick={() => run(() => rejectCalendarAction(c.id, reason), (r) => { if (r.ok) { setRejecting(null); setReason(""); } })}>
                            Confirm rejection
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {c.reviewStatus === "DRAFT" && (
                          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => submitCalendarAction(c.id))}>
                            <Send className="h-3.5 w-3.5" aria-hidden />Submit for review
                          </Button>
                        )}
                        <Button variant="danger" size="sm" onClick={() => setRejecting(c.id)}><X className="h-3.5 w-3.5" aria-hidden />Reject calendar</Button>
                        <Button variant="success" size="sm" disabled={pending} onClick={() => run(() => approveCalendarAction(c.id))}>
                          <Check className="h-3.5 w-3.5" aria-hidden />{pending ? "Approving calendar…" : "Approve calendar"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
