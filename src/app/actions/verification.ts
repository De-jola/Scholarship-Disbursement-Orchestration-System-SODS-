"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/session";
import {
  approveVerification, confirmField, correctField, markException, rejectVerification,
  requestClearerCopy, runExtraction, submitResultDocument,
} from "@/lib/verification-service";
import { extractPdfText } from "@/lib/pdf-text";
import { hasUsableText } from "@/lib/result-text";
import { db } from "@/lib/db";
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

const MAX_RESULT_BYTES = 5_000_000;
const DOC_TYPES = ["STATEMENT_OF_RESULT", "TRANSCRIPT", "COURSE_REGISTRATION_FORM"] as const;

/** Real upload: the file is read locally (PDF text layer or TXT) and its own content is extracted. Nothing is sent externally. */
export async function uploadResultFileAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireCan("verification.review");
    const beneficiaryId = String(formData.get("beneficiaryId") ?? "");
    const documentType = String(formData.get("documentType") ?? "") as DocType;
    const file = formData.get("file");
    if (!beneficiaryId) return { ok: false, message: "Select a beneficiary." };
    if (!(DOC_TYPES as readonly string[]).includes(documentType)) return { ok: false, message: "Select the document type." };
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a result document to upload (text-based PDF or TXT)." };
    if (file.size > MAX_RESULT_BYTES) return { ok: false, message: "The file is larger than 5 MB. Upload a smaller document." };
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext !== "pdf" && ext !== "txt") return { ok: false, message: "Upload a text-based PDF or TXT document. Images are not supported because OCR is not enabled in this demo." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = ext === "pdf" ? await extractPdfText(bytes) : new TextDecoder().decode(bytes);
    const sub = await submitResultDocument(actor, beneficiaryId, file.name, documentType, { rawText: text });
    await runExtraction(actor, sub.id);
    refresh();
    if (!hasUsableText(text)) {
      return { ok: true, message: "The document could not be read: it has no text layer (it may be a scan or photo). An exception was raised and a clearer copy is required." };
    }
    const status = (await db.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId } })).verificationStatus;
    return { ok: true, message: status === "REVIEW_PENDING" ? "Fields extracted from the document. Some values need attention: human review required." : "Fields extracted from the document. Human review is still required before verification." };
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
