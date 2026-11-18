import { PageHeader } from "@/components/ui/card";
import { UniversityTable } from "@/components/universities/university-table";
import { getUniversitiesOverview } from "@/lib/universities";
import { getNow } from "@/lib/clock";
import { requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";

export default async function UniversitiesPage() {
  const [session, rows] = await Promise.all([requireSession(), getUniversitiesOverview(getNow())]);
  return (
    <>
      <PageHeader
        title="Universities and academic calendars"
        description="Payment windows are derived from each university's approved academic calendar. A calendar must be approved before payments can be batched for that university."
      />
      <UniversityTable rows={rows} canManage={can(session.role, "calendar.manage")} />
    </>
  );
}
