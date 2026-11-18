"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/session";
import { activatePartner } from "@/lib/directory";
import type { ActionResult } from "@/components/ui/use-action";

export async function activatePartnerAction(universityId: string): Promise<ActionResult> {
  try {
    await activatePartner(await requireCan("calendar.manage"), universityId);
    for (const p of ["/universities", "/beneficiaries", "/"]) revalidatePath(p);
    return { ok: true, message: "University added as a programme partner. Upload and approve its academic calendar to enable payment batching." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The action failed. Please try again." };
  }
}
