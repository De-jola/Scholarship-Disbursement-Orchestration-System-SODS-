import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, humanize } from "@/lib/format";
import type { BeneficiaryListRow } from "@/lib/beneficiaries";

export function BeneficiaryTable({ rows, query }: { rows: BeneficiaryListRow[]; query: string }) {
  const href = (id: string) => `/beneficiaries?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), selected: id })}`;
  return (
    <Card className="overflow-x-auto">
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No beneficiaries match these filters" description="Clear or broaden the filters to see more beneficiaries." />
      ) : (
        <table className="w-full min-w-[960px]">
          <caption className="sr-only">Scholarship beneficiaries</caption>
          <thead>
            <tr>
              <th scope="col">Beneficiary</th><th scope="col">University</th><th scope="col">Department</th><th scope="col">Level</th>
              <th scope="col">Session</th><th scope="col">Verification status</th><th scope="col">Other scholarship</th><th scope="col">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td>
                  <Link href={href(b.id)} className="font-medium text-navy-800 underline-offset-2 hover:underline">{b.fullName}</Link>
                  <p className="text-xs text-slate-500">{b.applicationRef}</p>
                </td>
                <td>{b.universityShortName}</td>
                <td>{b.department}</td>
                <td>{b.level}</td>
                <td>{b.academicSession}</td>
                <td>
                  <StatusBadge kind="verification" value={b.verificationStatus} />
                  {b.exceptionType && !b.exceptionResolvedAt && <p className="mt-1 text-xs text-red-700">{humanize(b.exceptionType)}</p>}
                </td>
                <td>{b.otherScholarshipDeclaration ? <Badge tone="danger">Duplicate scholarship declared</Badge> : <span className="text-slate-400">None declared</span>}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(b.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
