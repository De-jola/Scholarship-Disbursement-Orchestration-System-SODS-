import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";
import { statusLabel } from "@/components/status-badge";
import { CATEGORIES } from "@/lib/rules";

const STATUSES = ["NOT_STARTED", "AWAITING_RESULT", "DOCUMENT_SUBMITTED", "EXTRACTED", "REVIEW_PENDING", "VERIFIED", "EXCEPTION", "REJECTED"];
const READINESS = Object.values(CATEGORIES);
const EXCEPTIONS = ["DUPLICATE_SCHOLARSHIP", "NAME_MISMATCH", "LOW_CONFIDENCE", "UNREADABLE_DOCUMENT", "OTHER"];

export interface FilterValues {
  q?: string; universityId?: string; status?: string; session?: string; exceptionType?: string; readiness?: string;
}

/** Plain GET form: filters live in the URL so views can be shared and bookmarked. */
export function BeneficiaryFilters({ values, universities, sessions }: {
  values: FilterValues; universities: { id: string; name: string }[]; sessions: string[];
}) {
  return (
    <form method="get" className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4" role="search" aria-label="Filter beneficiaries">
      <div className="xl:col-span-2">
        <label htmlFor="f-q" className="label">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <input id="f-q" name="q" defaultValue={values.q} placeholder="Name, matric number or reference" className="field pl-8" />
        </div>
      </div>
      <div>
        <label htmlFor="f-uni" className="label">University</label>
        <select id="f-uni" name="universityId" defaultValue={values.universityId ?? ""} className="field">
          <option value="">All universities</option>
          {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-status" className="label">Verification status</label>
        <select id="f-status" name="status" defaultValue={values.status ?? ""} className="field">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel("verification", s)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-ready" className="label">Payment readiness</label>
        <select id="f-ready" name="readiness" defaultValue={values.readiness ?? ""} className="field">
          <option value="">All</option>
          {READINESS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-session" className="label">Session</label>
        <select id="f-session" name="session" defaultValue={values.session ?? ""} className="field">
          <option value="">All sessions</option>
          {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-exc" className="label">Exception type</label>
        <select id="f-exc" name="exceptionType" defaultValue={values.exceptionType ?? ""} className="field">
          <option value="">Any / none</option>
          {EXCEPTIONS.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Link href="/beneficiaries" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear filters</Link>
      </div>
    </form>
  );
}
