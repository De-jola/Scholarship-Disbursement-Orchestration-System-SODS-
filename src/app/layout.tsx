import type { Metadata } from "next";
import "./globals.css";
import { DemoBanner } from "@/components/layout/demo-banner";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "SDOS — Scholarship Disbursement Orchestration System",
  description: "Pay the right student, at the right academic time, with full verification and control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>
        <ToastProvider>
          <div className="sticky top-0 z-40"><DemoBanner /></div>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
