"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Runs a server action, then surfaces a success or error toast and refreshes server data. */
export function useAction() {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function run(fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) {
    start(async () => {
      try {
        const r = await fn();
        toast(r.ok ? "success" : "error", r.message);
        if (r.ok) router.refresh();
        after?.(r);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "The action failed. Please try again.");
      }
    });
  }
  return { run, pending };
}
