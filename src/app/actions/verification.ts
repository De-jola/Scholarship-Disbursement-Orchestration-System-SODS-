"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/session";
import {
  approveVerification, confirmField, correctField, markException, rejectVerification,
  requestClearerCopy, runExtraction, submitResultDocument,
} from "@/lib/verification-service";
import type { ActionResult } from "@/components/ui/use-action";

type DocType = "STATEMENT_OF_RESULT" | "TRANSCRIPT" | "COURSE_REGISTRATION_FORM";
export type UploadScenario = "CLEAN" | "NAME_MISMATCH" | "LOW_QUALITY" | "UNREADABLE";

const SUFFIX: Record<UploadScenario, string> = { CLEAN: "", NAME_MISMATCH: "-name-mismatch", LOW_QUALITY: "-low-quality", UNREADABLE: "-unreadable" };

function fail(e: unknown): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "The action failed. Please try again." };
}

function refresh() {
  for (const p of ["/verification", "/beneficiaries", "/"]) revalidatePath(p);
}

/** Simulated upload: no file is stored. The scenario only shapes what the simulated extractor returns. */
export async function uploadResultDocumentAction(beneficiaryId: string, documentType: DocType, scenario: UploadScenario): Promise<ActionResult> {
  try {
    const actor = await requireCan("verification.review");
    const name = `prior-${documentType.toLowerCase().replace(/_/g, "-")}${SUFFIX[scenario] ?? ""}.pdf`;
    const sub = await submitResultDocument(actor, beneficiaryId, name, documentType);
    await runExtraction(actor, sub.id);
    refresh();
    return { ok: true, message: "Document uploaded and AI-assisted extraction complete. Human review required before the beneficiary can be verified." };
  } catch (e) {
    return fail(e);
  }
}

export async function runExtractionAction(submissionId: string): Promise<ActionResult> {
  try {
    await runExtraction(await requireCan("verification.review"), submissionId);
    refresh();
    return { ok: true, message: "AI-assisted extraction complete. Review each field against the document." };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmFieldAction(fieldId: string): Promise<ActionResult> {
  try {
    await confirmField(await requireCan("verification.review"), fieldId);
    refresh();
    return { ok: true, message: "Field confirmed." };
  } catch (e) {
    return fail(e);
  }
}

export async function correctFieldAction(fieldId: string, value: string): Promise<ActionResult> {
  try {
    await correctField(await requireCan("verification.review"), fieldId, value);
    refresh();
    return { ok: true, message: "Correction saved and recorded in the verification timeline." };
  } catch (e) {
    return fail(e);
  }
}

export async function approveVerificationAction(submissionId: string, notes: string): Promise<ActionResult> {
  try {
    await approveVerification(await requireCan("verification.review"), submissionId, notes);
    refresh();
    return { ok: true, message: "Verification approved. The beneficiary is now verified and can enter the next eligible payment batch." };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectVerificationAction(submissionId: string, note: string): Promise<ActionResult> {
  try {
    await rejectVerification(await requireCan("verification.review"), submissionId, note);
    refresh();
    return { ok: true, message: "Verification rejected. The beneficiary cannot be paid." };
  } catch (e) {
    return fail(e);
  }
}

export async function markExceptionAction(submissionId: string, note: string): Promise<ActionResult> {
  try {
    await requireCan("verification.review").then((a) => markException(a, submissionId, note));
    refresh();
    return { ok: true, message: "Exception recorded. The beneficiary is excluded from automatic batching until it is resolved." };
  } catch (e) {
    return fail(e);
  }
}

export async function clearerCopyAction(submissionId: string, note: string): Promise<ActionResult> {
  try {
    await requireCan("verification.review").then((a) => requestClearerCopy(a, submissionId, note));
    refresh();
    return { ok: true, message: "Clearer copy requested. The beneficiary has been returned to awaiting result." };
  } catch (e) {
    return fail(e);
  }
}
