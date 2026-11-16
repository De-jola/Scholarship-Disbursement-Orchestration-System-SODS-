"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, ClipboardCheck, Layers, Wallet, ScrollText, BarChart3, PlayCircle, GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/universities", label: "Universities", icon: Building2 },
  { href: "/beneficiaries", label: "Beneficiaries", icon: Users },
  { href: "/verification", label: "Verification Queue", icon: ClipboardCheck },
  { href: "/batches", label: "Payment Batches", icon: Layers },
  { href: "/fund", label: "Fund Allocation", icon: Wallet },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/demo", label: "Demo Scenarios", icon: PlayCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-navy-900 text-navy-100 lg:w-64" aria-label="Primary">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="rounded-md bg-brand p-1.5 text-white"><GraduationCap className="h-5 w-5" aria-hidden /></span>
        <div>
          <p className="text-lg font-bold leading-none tracking-tight text-white">SDOS</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-navy-300">Disbursement Orchestration</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 pb-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-offset-navy-900",
                active ? "bg-navy-700 text-white" : "text-navy-200 hover:bg-navy-800 hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-brand")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
