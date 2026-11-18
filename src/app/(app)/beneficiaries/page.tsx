import { PageHeader } from "@/components/ui/card";
import { BeneficiaryFilters } from "@/components/beneficiaries/beneficiary-filters";
import { BeneficiaryTable } from "@/components/beneficiaries/beneficiary-table";
import { BeneficiaryDrawer } from "@/components/beneficiaries/beneficiary-drawer";
import { getBeneficiaryDetail, listBeneficiaries } from "@/lib/beneficiaries";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";

type Params = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function BeneficiariesPage({ searchParams }: { searchParams: Params }) {
  const filters = {
    q: one(searchParams.q), universityId: one(searchParams.universityId), status: one(searchParams.status),
    session: one(searchParams.session), exceptionType: one(searchParams.exceptionType),
  };
  const selected = one(searchParams.selected);
  const session = await requireSession();

  const [rows, universities, sessions, detail] = await Promise.all([
    listBeneficiaries(filters),
    db.university.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.beneficiary.findMany({ select: { academicSession: true }, distinct: ["academicSession"], orderBy: { academicSession: "asc" } }),
    selected ? getBeneficiaryDetail(selected) : Promise.resolve(null),
  ]);

  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Beneficiaries" description={`${rows.length} beneficiar${rows.length === 1 ? "y" : "ies"} shown. Select a name to open the full record, verification timeline and payment history.`} />
      <BeneficiaryFilters values={filters} universities={universities} sessions={sessions.map((s) => s.academicSession)} />
      <BeneficiaryTable rows={rows} query={qs} />
      <BeneficiaryDrawer key={selected ?? "none"} detail={detail} canResolve={can(session.role, "exception.resolve")} />
    </>
  );
}
