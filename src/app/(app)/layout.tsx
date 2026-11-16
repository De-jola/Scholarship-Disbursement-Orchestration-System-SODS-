import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireSession } from "@/lib/session";
import { getNow } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const clock = getNow().toISOString().slice(0, 10);
  return (
    <div className="flex min-h-[calc(100vh-30px)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={session.name} role={session.role} clock={clock} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
