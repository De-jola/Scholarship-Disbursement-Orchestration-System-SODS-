"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const NAVY = "#1d3558";
const GREEN = "#1f9d6b";
const AMBER = "#d97706";
const RED = "#dc2626";
const SLATE = "#94a3b8";

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: "#cbd5e1",
  AWAITING_RESULT: "#7dd3fc",
  DOCUMENT_SUBMITTED: "#38bdf8",
  EXTRACTED: "#5578aa",
  REVIEW_PENDING: AMBER,
  VERIFIED: GREEN,
  EXCEPTION: RED,
  REJECTED: "#7f1d1d",
};

interface Props {
  readiness: { university: string; ready: number; scheduled: number; waiting: number; blocked: number }[];
  statusBreakdown: { status: string; label: string; count: number }[];
  trend: { month: string; disbursed: number; committed: number }[];
}

const millions = (v: number) => `₦${(v / 1_000_000).toFixed(2)}M`;

export function DashboardCharts({ readiness, statusBreakdown, trend }: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ChartCard title="Disbursement readiness by university" note="Payment-ready, already scheduled, waiting (calendar, window or verification) and blocked beneficiaries per institution.">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={readiness} margin={{ left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="university" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ready" name="Payment-ready" stackId="a" fill={GREEN} />
            <Bar dataKey="scheduled" name="In a payment batch" stackId="a" fill={NAVY} />
            <Bar dataKey="waiting" name="Waiting" stackId="a" fill={SLATE} />
            <Bar dataKey="blocked" name="Blocked / exception" stackId="a" fill={RED} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Verification-status breakdown" note="All beneficiaries by current verification state.">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={statusBreakdown.filter((s) => s.count > 0)} dataKey="count" nameKey="label" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {statusBreakdown.filter((s) => s.count > 0).map((s) => (
                <Cell key={s.status} fill={STATUS_COLOR[s.status] ?? NAVY} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly simulated disbursement trend" note="Simulated payments completed and approved funds committed, by month.">
        {trend.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No simulated disbursements recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={millions} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={(v) => `₦${Number(v).toLocaleString("en-NG")}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="disbursed" name="Disbursed (simulated)" stroke={GREEN} strokeWidth={2} dot />
              <Line type="monotone" dataKey="committed" name="Committed" stroke={NAVY} strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
      <p className="mb-2 text-xs text-slate-500">{note}</p>
      {children}
    </section>
  );
}
