import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ActivateButton } from "@/components/universities/activate-button";
import { directoryStates, listDirectory } from "@/lib/directory";

export interface DirectoryParams {
  q?: string;
  state?: string;
  category?: string;
  page: number;
}

export async function DirectorySection({ params, canManage }: { params: DirectoryParams; canManage: boolean }) {
  const [{ rows, pagination }, states] = await Promise.all([listDirectory({ ...params, pageSize: 10 }), directoryStates()]);
  const active = Object.fromEntries(Object.entries({ q: params.q, state: params.state, category: params.category }).filter(([, v]) => v)) as Record<string, string>;

  return (
    <Card className="mt-8" aria-labelledby="directory-heading">
      <CardHeader
        title="Institution directory"
        description="Registered Nigerian universities that are not yet programme partners. Names, states and websites come from an open dataset (CC0); all programme data in SDOS is synthetic."
      />
      <form method="get" action="/universities" className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Search the institution directory">
        <div className="lg:col-span-2">
          <label htmlFor="d-q" className="label">Search by name</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input id="d-q" name="q" defaultValue={params.q} placeholder="e.g. Ibadan" className="field pl-8" />
          </div>
        </div>
        <div>
          <label htmlFor="d-state" className="label">State</label>
          <select id="d-state" name="state" defaultValue={params.state ?? ""} className="field">
            <option value="">All states</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="d-cat" className="label">Ownership</label>
          <select id="d-cat" name="category" defaultValue={params.category ?? ""} className="field">
            <option value="">Federal, state and private</option>
            <option value="Federal">Federal</option><option value="State">State</option><option value="Private">Private</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Search directory</Button>
          <Link href="/universities" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear filters</Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title="No institutions match your search" description="Try a different name, or clear the state and ownership filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <caption className="sr-only">Institutions in the national register that are not yet programme partners</caption>
            <thead>
              <tr><th scope="col">Institution</th><th scope="col">State</th><th scope="col">Ownership</th><th scope="col">Established</th><th scope="col">Website</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="font-medium text-navy-900">{u.name}</td>
                  <td>{u.state}</td>
                  <td><Badge tone={u.category === "Federal" ? "navy" : u.category === "State" ? "info" : "neutral"}>{u.category || "—"}</Badge></td>
                  <td>{u.yearEstablished ?? "—"}</td>
                  <td className="text-xs">{u.websiteUrl ? <span className="text-slate-600">{u.websiteUrl.replace(/^https?:\/\//, "")}</span> : <span className="text-slate-400">Not listed</span>}</td>
                  {canManage && <td className="text-right"><ActivateButton id={u.id} name={u.name} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination info={pagination} basePath="/universities" params={active} noun="institutions" />
    </Card>
  );
}
