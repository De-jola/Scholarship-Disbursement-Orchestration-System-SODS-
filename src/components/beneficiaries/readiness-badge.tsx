import { Badge, type Tone } from "@/components/ui/badge";

export interface ReadinessLite {
  key: string;
  label: string;
  tone: Tone;
}

export function ReadinessBadge({ readiness }: { readiness: ReadinessLite | undefined }) {
  if (!readiness) return <span className="text-slate-400">Not assessed</span>;
  return <Badge tone={readiness.tone}>{readiness.label}</Badge>;
}
