"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-white p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-600" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-navy-900">This page could not be loaded</h1>
      <p className="mt-1 text-sm text-slate-600">{error.message || "An unexpected error occurred."}</p>
      <p className="mt-1 text-xs text-slate-500">If the database is empty, run <code>npm run db:reset</code>.</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
