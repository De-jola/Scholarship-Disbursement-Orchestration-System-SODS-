import { LogOut, CalendarClock } from "lucide-react";
import { signOut, setClock } from "@/app/actions/session";
import { CLOCK_PRESETS } from "@/lib/clock";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClockSelect } from "@/components/layout/clock-select";

export function Topbar({ name, role, clock }: { name: string; role: Role; clock: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <form action={setClock} className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-slate-500" aria-hidden />
        <label htmlFor="clock" className="text-xs font-medium text-slate-600">Demo date</label>
        <ClockSelect value={clock} options={CLOCK_PRESETS} />
      </form>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-navy-900">{name}</p>
          <Badge tone={role === "ADMIN" ? "navy" : "success"}>{ROLE_LABEL[role]}</Badge>
        </div>
        <form action={signOut}>
          <Button variant="secondary" size="sm" type="submit"><LogOut className="h-3.5 w-3.5" aria-hidden />Sign out</Button>
        </form>
      </div>
    </header>
  );
}
