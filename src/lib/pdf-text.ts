import { extractText, getDocumentProxy } from "unpdf";

/**
 * Reads the text layer of a PDF locally. Scanned or image-only PDFs have no text layer and return an empty string:
 * OCR is intentionally not enabled in this demo, so nothing is sent to an external service.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  } catch {
    return "";
  }
}
