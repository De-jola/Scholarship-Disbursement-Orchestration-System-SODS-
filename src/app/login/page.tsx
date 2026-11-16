import { GraduationCap, ShieldCheck, ClipboardCheck, Landmark } from "lucide-react";
import { signIn } from "@/app/actions/session";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="grid min-h-[calc(100vh-30px)] lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-navy-900 p-10 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-brand p-2"><GraduationCap className="h-6 w-6" aria-hidden /></span>
          <span className="text-2xl font-bold tracking-tight">SDOS</span>
        </div>
        <div className="max-w-md py-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Scholarship Disbursement Orchestration System</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight">
            Pay the right student, at the right academic time, with full verification and control.
          </h1>
          <ul className="mt-8 space-y-3 text-sm text-navy-100">
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-brand" aria-hidden />University-specific payment windows from approved calendars</li>
            <li className="flex items-center gap-3"><ClipboardCheck className="h-4 w-4 text-brand" aria-hidden />AI-assisted extraction with mandatory human approval</li>
            <li className="flex items-center gap-3"><Landmark className="h-4 w-4 text-brand" aria-hidden />Finance approval and fund controls on every batch</li>
          </ul>
        </div>
        <p className="text-xs text-navy-300">Demonstration prototype inspired by corporate national undergraduate scholarship programmes.</p>
      </section>

      <section className="flex items-center justify-center bg-surface p-8">
        <div className="w-full max-w-md">
          <h2 className="text-xl font-semibold text-navy-900">Sign in to the demo</h2>
          <p className="mt-1 text-sm text-slate-600">Select a role. No password is required in this demonstration environment.</p>
          <div className="mt-6 space-y-3">
            <form action={signIn}>
              <input type="hidden" name="role" value="ADMIN" />
              <Button type="submit" className="w-full justify-start py-3">Sign in as Scholarship Administrator</Button>
              <p className="mt-1.5 text-xs text-slate-500">Manage calendars, review verifications, resolve exceptions and prepare payment batches.</p>
            </form>
            <form action={signIn}>
              <input type="hidden" name="role" value="FINANCE_APPROVER" />
              <Button type="submit" variant="success" className="w-full justify-start py-3">Sign in as Finance Approver</Button>
              <p className="mt-1.5 text-xs text-slate-500">Approve payment batches, enforce fund limits and run simulated disbursement.</p>
            </form>
          </div>
          <p className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Demo mode.</strong> All beneficiaries, universities and bank references are synthetic. No real payments, e-mail or external AI services are used.
          </p>
        </div>
      </section>
    </main>
  );
}
