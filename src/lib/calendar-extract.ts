import { parseCalendarFile, type ParseResult } from "@/lib/calendar-parser";
import { extractEventsFromText } from "@/lib/calendar-text";
import { extractPdfText } from "@/lib/pdf-text";

const NO_TEXT =
  "No text could be read from this PDF. It may be a scanned image (OCR is not enabled in this demo). Upload a CSV or JSON file, a text-based PDF, or add the events manually.";

/** Extracts calendar events from an uploaded file by reading its actual content. */
export async function extractCalendar(fileName: string, bytes: Uint8Array, session: string): Promise<ParseResult> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const decode = () => new TextDecoder("utf-8").decode(bytes);

  if (ext === "csv" || ext === "json") return parseCalendarFile(fileName, decode(), session);

  if (ext === "pdf" || ext === "txt") {
    const text = ext === "pdf" ? await extractPdfText(bytes) : decode();
    if (text.replace(/\s/g, "").length < 20) return { events: [], errors: [NO_TEXT], sourceType: "SIMULATED_PORTAL" };
    const { events, warnings } = extractEventsFromText(text, session);
    if (events.length === 0) {
      return {
        events: [],
        errors: ["No calendar events could be identified in this file. Each event needs a recognisable name (for example Registration or Examinations) and a date, such as \"Registration: 9th - 27th November 2026\".", ...warnings],
        sourceType: "SIMULATED_PORTAL",
      };
    }
    return { events, errors: warnings, sourceType: "SIMULATED_PORTAL" };
  }
  return { events: [], errors: [`Unsupported file type ".${ext}". Upload a CSV, JSON, text-based PDF or TXT file.`], sourceType: "CSV_UPLOAD" };
}
