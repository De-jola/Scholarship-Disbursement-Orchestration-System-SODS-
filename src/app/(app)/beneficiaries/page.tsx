import { PageHeader } from "@/components/ui/card";
import { BeneficiaryFilters } from "@/components/beneficiaries/beneficiary-filters";
import { BeneficiaryTable } from "@/components/beneficiaries/beneficiary-table";
import { BeneficiaryDrawer } from "@/components/beneficiaries/beneficiary-drawer";
import { Pagination } from "@/components/ui/pagination";
import { getBeneficiaryDetail, listBeneficiariesPage } from "@/lib/beneficiaries";
import { parsePage } from "@/lib/pagination";
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

  const [{ rows, pagination }, universities, sessions, detail] = await Promise.all([
    listBeneficiariesPage(filters, parsePage(searchParams.page)),
    db.university.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.beneficiary.findMany({ select: { academicSession: true }, distinct: ["academicSession"], orderBy: { academicSession: "asc" } }),
    selected ? getBeneficiaryDetail(selected) : Promise.resolve(null),
  ]);

  const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
  // The drawer link keeps filters and the current page so closing it returns to the same view.
  const qs = new URLSearchParams({ ...active, ...(pagination.page > 1 ? { page: String(pagination.page) } : {}) }).toString();

  return (
    <>
      <PageHeader title="Beneficiaries" description="Select a name to open the full record, verification timeline and payment history." />
      <BeneficiaryFilters values={filters} universities={universities} sessions={sessions.map((s) => s.academicSession)} />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <BeneficiaryTable rows={rows} query={qs} bare />
        <Pagination info={pagination} basePath="/beneficiaries" params={active} noun="beneficiaries" />
      </div>
      <BeneficiaryDrawer key={selected ?? "none"} detail={detail} canResolve={can(session.role, "exception.resolve")} />
    </>
  );
}
