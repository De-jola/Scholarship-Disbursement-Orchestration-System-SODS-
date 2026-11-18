import { PageHeader } from "@/components/ui/card";
import { UniversityTable } from "@/components/universities/university-table";
import { DirectorySection } from "@/components/universities/directory-section";
import { getUniversitiesOverview } from "@/lib/universities";
import { getNow } from "@/lib/clock";
import { parsePage } from "@/lib/pagination";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";

type Params = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function UniversitiesPage({ searchParams }: { searchParams: Params }) {
  const [session, rows] = await Promise.all([requireSession(), getUniversitiesOverview(getNow())]);
  const canManage = can(session.role, "calendar.manage");
  return (
    <>
      <PageHeader
        title="Universities and academic calendars"
        description="Programme partner universities. Payment windows come from each university's approved academic calendar, which must be approved before payments can be batched. Calendar dates shown in this demo are illustrative."
      />
      <UniversityTable rows={rows} canManage={canManage} />
      <DirectorySection
        canManage={canManage}
        params={{ q: one(searchParams.q), state: one(searchParams.state), category: one(searchParams.category), page: parsePage(searchParams.page) }}
      />
    </>
  );
}
