/**
 * Local calendar ingestion for structured files (CSV, JSON). Nothing here scrapes a website or calls an external service.
 * PDF and text files are read by calendar-extract.ts, which reads their actual content.
 */

export const EVENT_TYPES = ["RESUMPTION", "REGISTRATION", "LECTURES", "EXAMINATION", "BREAK", "SESSION_END"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type SourceType = "MANUAL_ENTRY" | "CSV_UPLOAD" | "SIMULATED_PORTAL";

export interface ParsedEvent {
  eventType: EventType;
  title: string;
  startDate: Date;
  endDate: Date;
  confidence: number;
  sourceText: string;
}

export interface ParseResult {
  events: ParsedEvent[];
  errors: string[];
  sourceType: SourceType;
}

const KEYWORDS: [RegExp, EventType][] = [
  [/regist/i, "REGISTRATION"],
  [/resum/i, "RESUMPTION"],
  [/exam/i, "EXAMINATION"],
  [/lectur|teaching|semester begins/i, "LECTURES"],
  [/break|vacation|recess|holiday/i, "BREAK"],
  [/end of session|session end|close of session|convocation/i, "SESSION_END"],
];

function inferType(title: string): EventType | null {
  return KEYWORDS.find(([re]) => re.test(title))?.[1] ?? null;
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d, 9));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

interface RawRow {
  eventType?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  sourceText?: string;
}

function toEvent(row: RawRow, label: string): { event?: ParsedEvent; error?: string } {
  const title = (row.title ?? "").trim();
  if (!title) return { error: `${label}: title is required.` };
  const start = parseDate(row.startDate ?? "");
  const end = parseDate(row.endDate ?? "");
  if (!start || !end) return { error: `${label}: startDate and endDate must be YYYY-MM-DD or DD/MM/YYYY.` };
  if (end < start) return { error: `${label}: endDate is before startDate.` };

  const declared = (row.eventType ?? "").trim().toUpperCase() as EventType;
  let eventType: EventType;
  let confidence = 0.95;
  if ((EVENT_TYPES as readonly string[]).includes(declared)) {
    eventType = declared;
  } else {
    const inferred = inferType(title);
    if (!inferred) return { error: `${label}: event type could not be determined from "${title}".` };
    eventType = inferred;
    confidence = 0.7; // inferred, so flag for reviewer attention
  }
  return {
    event: { eventType, title, startDate: start, endDate: end, confidence, sourceText: (row.sourceText ?? "").trim() || title },
  };
}

function parseCsv(content: string): { events: ParsedEvent[]; errors: string[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { events: [], errors: ["The file is empty."] };
  const header = splitCsvLine(lines[0]);
  const missing = ["eventType", "title", "startDate", "endDate"].filter((c) => !header.includes(c));
  if (missing.length) return { events: [], errors: [`Missing required column(s): ${missing.join(", ")}.`] };

  const events: ParsedEvent[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line);
    const row: RawRow = {};
    header.forEach((h, idx) => {
      (row as Record<string, string>)[h] = cells[idx] ?? "";
    });
    const r = toEvent(row, `Row ${i + 2}`);
    if (r.event) events.push(r.event);
    else if (r.error) errors.push(r.error);
  });
  return { events, errors };
}

function parseJson(content: string): { events: ParsedEvent[]; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { events: [], errors: ["The file is not valid JSON."] };
  }
  const rows = Array.isArray(data) ? data : (data as { events?: unknown })?.events;
  if (!Array.isArray(rows)) return { events: [], errors: ["JSON must be an array of events or an object with an events array."] };
  const events: ParsedEvent[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const r = toEvent(row as RawRow, `Event ${i + 1}`);
    if (r.event) events.push(r.event);
    else if (r.error) errors.push(r.error);
  });
  return { events, errors };
}

export function parseCalendarFile(fileName: string, content: string, _session: string): ParseResult {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return { ...parseCsv(content), sourceType: "CSV_UPLOAD" };
  if (ext === "json") return { ...parseJson(content), sourceType: "CSV_UPLOAD" };
  return { events: [], errors: [`Unsupported file type ".${ext}". Upload a CSV, JSON or PDF file.`], sourceType: "CSV_UPLOAD" };
}

export function validateForApproval(events: { eventType: string; startDate: Date; endDate: Date }[]): string | null {
  if (events.length === 0) return "The calendar must contain at least one event before it can be approved.";
  if (!events.some((e) => e.eventType === "REGISTRATION")) {
    return "The calendar must include a registration event; payment windows are derived from it.";
  }
  return null;
}
