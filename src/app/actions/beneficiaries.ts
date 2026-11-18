"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/session";
import { declareDuplicateScholarship, resolveException } from "@/lib/beneficiary-service";
import type { ActionResult } from "@/components/ui/use-action";

function fail(e: unknown): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "The action failed. Please try again." };
}

export async function declareDuplicateAction(beneficiaryId: string, note: string): Promise<ActionResult> {
  try {
    await declareDuplicateScholarship(await requireCan("exception.resolve"), beneficiaryId, note);
    revalidatePath("/beneficiaries");
    revalidatePath("/");
    return { ok: true, message: "Duplicate scholarship declared. The beneficiary is now excluded from payment batches." };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveExceptionAction(beneficiaryId: string, outcome: "CLEARED" | "REJECTED", note: string): Promise<ActionResult> {
  try {
    await resolveException(await requireCan("exception.resolve"), beneficiaryId, outcome, note);
    revalidatePath("/beneficiaries");
    revalidatePath("/");
    return {
      ok: true,
      message: outcome === "CLEARED" ? "Exception cleared. The beneficiary can re-enter eligible payment batches." : "Exception confirmed. The beneficiary has been rejected and cannot be paid.",
    };
  } catch (e) {
    return fail(e);
  }
}
