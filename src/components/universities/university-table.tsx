"use client";

import { useState } from "react";
import { Building2, CalendarPlus, Eye, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { CalendarDrawer } from "@/components/universities/calendar-drawer";
import { UploadCalendarModal, ManualEventModal } from "@/components/universities/calendar-modals";
import type { UniversityRow } from "@/lib/universities";

const STATE: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: "Calendar approved", tone: "success" },
  PENDING_REVIEW: { label: "Awaiting calendar approval", tone: "warning" },
  DRAFT: { label: "Draft calendar", tone: "neutral" },
  REJECTED: { label: "Calendar rejected", tone: "danger" },
  MISSING: { label: "No calendar on file", tone: "danger" },
  EXPIRED: { label: "Calendar expired", tone: "warning" },
};

type Dialog = { kind: "view" | "upload" | "manual"; uni: UniversityRow } | null;

export function UniversityTable({ rows, canManage }: { rows: UniversityRow[]; canManage: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  // Re-resolve from props so the drawer reflects refreshed server data after an action.
  const live = dialog ? rows.find((r) => r.id === dialog.uni.id) ?? dialog.uni : null;

  return (
    <>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="No universities configured" description="Partner universities will be listed here once added." />
        ) : (
          <table className="w-full min-w-[900px]">
            <caption className="sr-only">Partner universities and their academic calendar status</caption>
            <thead>
              <tr>
                <th scope="col">University</th><th scope="col">State</th><th scope="col">Calendar status</th>
                <th scope="col">Session</th><th scope="col" className="text-right">Beneficiaries</th>
                <th scope="col" className="text-right">Verified</th><th scope="col">Payment window opens</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => {
                const s = STATE[u.calendarStatus];
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td><p className="font-medium text-navy-900">{u.name}</p><p className="text-xs text-slate-500">{u.shortName}</p></td>
                    <td>{u.state}</td>
                    <td><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td>{u.currentSession}</td>
                    <td className="text-right tabular-nums">{u.beneficiaryCount}</td>
                    <td className="text-right tabular-nums">{u.verifiedCount}</td>
                    <td>{u.nextPaymentWindow ? formatDate(u.nextPaymentWindow) : <span className="text-slate-400">Awaiting calendar approval</span>}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "view", uni: u })} aria-label={`View calendar for ${u.name}`}>
                          <Eye className="h-3.5 w-3.5" aria-hidden />View calendar
                        </Button>
                        {canManage && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "upload", uni: u })} aria-label={`Upload calendar for ${u.name}`}>
                              <Upload className="h-3.5 w-3.5" aria-hidden />Upload
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "manual", uni: u })} aria-label={`Manually add calendar event for ${u.name}`}>
                              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />Add event
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <CalendarDrawer open={dialog?.kind === "view"} university={live} canManage={canManage} onClose={close} />
      <UploadCalendarModal open={dialog?.kind === "upload"} university={live} onClose={close} />
      <ManualEventModal open={dialog?.kind === "manual"} university={live} onClose={close} />
    </>
  );
}
