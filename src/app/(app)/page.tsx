import Link from "next/link";
import { AlertTriangle, Info, OctagonAlert, Wallet, PiggyBank, Lock, Banknote, BadgeCheck, Hourglass, Layers, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardData } from "@/lib/metrics";
import { getNow } from "@/lib/clock";
import { formatDateTime, formatNaira, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

function Kpi({ label, value, icon: Icon, tone = "navy", href }: { label: string; value: string; icon: LucideIcon; tone?: "navy" | "green" | "amber" | "red"; href?: string }) {
  const tones = { navy: "bg-navy-50 text-navy-600", green: "bg-brand-light text-brand-dark", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  const body = (
    <div className="flex items-center gap-4 p-4">
      <span className={cn("rounded-lg p-2.5", tones[tone])}><Icon className="h-5 w-5" aria-hidden /></span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-navy-900">{value}</p>
      </div>
    </div>
  );
  return (
    <Card className="transition-shadow hover:shadow-md">
      {href ? <Link href={href} className="block rounded-lg">{body}</Link> : body}
    </Card>
  );
}

const SEVERITY = {
  info: { icon: Info, cls: "border-sky-200 bg-sky-50 text-sky-900" },
  warning: { icon: AlertTriangle, cls: "border-amber-200 bg-amber-50 text-amber-900" },
  danger: { icon: OctagonAlert, cls: "border-red-200 bg-red-50 text-red-900" },
} as const;

export default async function DashboardPage() {
  const data = await getDashboardData(getNow());
  const { kpis } = data;

  return (
    <>
      <PageHeader
        title="Programme dashboard"
        description="Fund position, verification progress and items that need attention across all partner universities."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total scholarship fund" value={formatNaira(kpis.totalFund)} icon={Wallet} href="/fund" />
        <Kpi label="Available fund" value={formatNaira(kpis.available)} icon={PiggyBank} tone="green" href="/fund" />
        <Kpi label="Committed funds" value={formatNaira(kpis.committed)} icon={Lock} href="/fund" />
        <Kpi label="Disbursed funds (simulated)" value={formatNaira(kpis.disbursed)} icon={Banknote} tone="green" href="/fund" />
        <Kpi label="Verified beneficiaries" value={String(kpis.verified)} icon={BadgeCheck} tone="green" href="/beneficiaries" />
        <Kpi label="Pending verifications" value={String(kpis.pendingVerifications)} icon={Hourglass} tone="amber" href="/verification" />
        <Kpi label="Batches awaiting approval" value={String(kpis.batchesAwaitingApproval)} icon={Layers} tone="amber" href="/batches" />
        <Kpi label="Exceptions requiring action" value={String(kpis.exceptions)} icon={ShieldAlert} tone="red" href="/beneficiaries" />
      </div>

      <div className="mt-6">
        <DashboardCharts readiness={data.readiness} statusBreakdown={data.statusBreakdown} trend={data.trend} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Alerts" description="Conditions that may delay or block payments." />
          {data.alerts.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No active alerts" description="Calendars, verifications and batches are all in good order." />
          ) : (
            <ul className="space-y-2 p-4">
              {data.alerts.map((a, i) => {
                const S = SEVERITY[a.severity];
                return (
                  <li key={i}>
                    <Link href={a.href} className={cn("flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm", S.cls)}>
                      <S.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span><span className="font-semibold">{a.title}.</span> {a.detail}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="Latest entries from the audit trail." />
          {data.activity.length === 0 ? (
            <EmptyState icon={Info} title="No activity yet" description="Actions taken in SDOS will appear here." />
          ) : (
            <ol className="divide-y divide-slate-100">
              {data.activity.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="text-sm text-slate-800">{a.details}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {humanize(a.action)} · {a.actorName} · {formatDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
