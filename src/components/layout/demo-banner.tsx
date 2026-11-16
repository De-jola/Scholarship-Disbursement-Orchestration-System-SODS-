import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-navy-950">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      DEMO ENVIRONMENT — All data is synthetic. No live payments or external AI processing.
    </div>
  );
}
