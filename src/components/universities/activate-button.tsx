"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { activatePartnerAction } from "@/app/actions/directory";

export function ActivateButton({ id, name }: { id: string; name: string }) {
  const { run, pending } = useAction();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => activatePartnerAction(id))} aria-label={`Add ${name} as a programme partner`}>
      <Plus className="h-3.5 w-3.5" aria-hidden />{pending ? "Adding partner…" : "Add as partner"}
    </Button>
  );
}
