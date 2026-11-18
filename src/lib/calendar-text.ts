/**
 * Local, rule-based extraction of academic-calendar events from plain text (for example the text layer
 * of a PDF). It reads the dates actually present in the document: no template, no network, no external AI.
 * Every result still goes to a human reviewer, and confidence reflects how certain each reading is.
 */
import type { EventType, ParsedEvent } from "@/lib/calendar-parser";

const MONTH_NAMES = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
const M = `(${MONTH_NAMES})\\.?`;
const ORD = "(?:st|nd|rd|th)?";
const RANGE = "(?:-|–|—|to|until|till|through)";

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const monthOf = (name: string) => MONTH_INDEX[name.toLowerCase().slice(0, 3)];

// Event types in precedence order (earlier wins when a line mentions several).
const TYPE_RULES: [RegExp, EventType][] = [
  [/\bregist(ration|er)/i, "REGISTRATION"],
  [/\bresum(e|es|ption|ing)\b/i, "RESUMPTION"],
  [/\bexam(ination)?s?\b/i, "EXAMINATION"],
  [/\b(break|vacation|recess|holiday)\b/i, "BREAK"],
  [/\b(end of (the )?(academic )?session|session (end|ends|closes|close)|close of session|convocation)\b/i, "SESSION_END"],
  [/\blectur|\bteaching\b|\bsemester (begins|commences)\b/i, "LECTURES"],
];

const TITLES: Record<EventType, string> = {
  RESUMPTION: "Resumption", REGISTRATION: "Course registration", LECTURES: "Lectures",
  EXAMINATION: "Examinations", BREAK: "Break", SESSION_END: "End of session",
};

/** Event types that normally span a period, so a single date is less certain. */
const SPANNING: EventType[] = ["REGISTRATION", "LECTURES", "EXAMINATION", "BREAK"];

function typeOf(text: string): EventType | null {
  return TYPE_RULES.find(([re]) => re.test(text))?.[1] ?? null;
}

interface RawDate { day: number; month: number; year: number | null; index: number; length: number }

function mask(text: string, index: number, length: number): string {
  return text.slice(0, index) + " ".repeat(length) + text.slice(index + length);
}

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d, 9));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Collects individual dates (ISO, numeric, "3rd November 2026", "November 3, 2026") in reading order. */
function findDates(text: string): RawDate[] {
  const found: RawDate[] = [];
  let work = text;
  const take = (re: RegExp, build: (m: RegExpExecArray) => Omit<RawDate, "index" | "length">) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(work))) {
      found.push({ ...build(m), index: m.index, length: m[0].length });
      work = mask(work, m.index, m[0].length);
      re.lastIndex = 0;
    }
  };
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => ({ year: +m[1], month: +m[2], day: +m[3] }));
  take(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, (m) => ({ day: +m[1], month: +m[2], year: +m[3] }));
  take(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${M}(?:,?\\s*(\\d{4}))?`, "gi"), (m) => ({ day: +m[1], month: monthOf(m[2]), year: m[3] ? +m[3] : null }));
  take(new RegExp(`\\b${M}\\s+(\\d{1,2})${ORD}(?:,?\\s*(\\d{4}))?`, "gi"), (m) => ({ month: monthOf(m[1]), day: +m[2], year: m[3] ? +m[3] : null }));
  return found.sort((a, b) => a.index - b.index);
}

interface Span { start: RawDate; end: RawDate | null; firstIndex: number }

/** Reads "9th - 27th November 2026" and "November 3 - 21, 2026" style ranges first. */
function findShorthandRange(text: string): { span: Span; masked: string } | null {
  const s1 = new RegExp(`\\b(\\d{1,2})${ORD}\\s*${RANGE}\\s*(\\d{1,2})${ORD}\\s+(?:of\\s+)?${M}(?:,?\\s*(\\d{4}))?`, "i").exec(text);
  if (s1) {
    const month = monthOf(s1[3]);
    const year = s1[4] ? +s1[4] : null;
    return {
      span: { start: { day: +s1[1], month, year, index: s1.index, length: 0 }, end: { day: +s1[2], month, year, index: s1.index, length: 0 }, firstIndex: s1.index },
      masked: mask(text, s1.index, s1[0].length),
    };
  }
  const s2 = new RegExp(`\\b${M}\\s+(\\d{1,2})${ORD}\\s*${RANGE}\\s*(\\d{1,2})${ORD}(?:,?\\s*(\\d{4}))?`, "i").exec(text);
  if (s2) {
    const month = monthOf(s2[1]);
    const year = s2[4] ? +s2[4] : null;
    return {
      span: { start: { day: +s2[2], month, year, index: s2.index, length: 0 }, end: { day: +s2[3], month, year, index: s2.index, length: 0 }, firstIndex: s2.index },
      masked: mask(text, s2.index, s2[0].length),
    };
  }
  return null;
}

function toSpan(text: string): Span | null {
  const range = findShorthandRange(text);
  if (range) return range.span;
  const dates = findDates(text);
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates.length > 1 ? dates[dates.length - 1] : null, firstIndex: dates[0].index };
}

function titleFrom(line: string, span: Span, type: EventType): string {
  let t = line.slice(0, span.firstIndex).replace(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b\s*$/i, "").replace(/[\s:|,\-–—]+$/g, "").trim();
  if (!t) t = TITLES[type];
  return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

export interface TextExtraction { events: ParsedEvent[]; warnings: string[] }

export function extractEventsFromText(text: string, session: string): TextExtraction {
  const sessionStart = Number.parseInt(session.slice(0, 4), 10) || new Date().getUTCFullYear();
  const inferYear = (month: number) => (month >= 8 ? sessionStart : sessionStart + 1);

  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const events: ParsedEvent[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let type = typeOf(line);
    let span = toSpan(line);

    // A title on one line with its dates on the next.
    if (type && !span && i + 1 < lines.length && !typeOf(lines[i + 1]) && toSpan(lines[i + 1])) {
      line = `${line} ${lines[i + 1]}`;
      span = toSpan(line);
      i++;
    }
    if (!span) continue;
    if (!type) {
      warnings.push(`Skipped "${line.slice(0, 80)}": no recognised calendar event type.`);
      continue;
    }

    // Resolve years: explicit, borrowed from the other end of the range, or inferred from the session.
    let { start, end } = span;
    let confidence = 0.92;
    let sy = start.year;
    let ey = end ? end.year : start.year;
    if (sy === null && ey !== null) {
      sy = ey;
      confidence = 0.88;
    } else if (ey === null && sy !== null) {
      ey = sy;
      confidence = 0.88;
    }
    let inferred = false;
    if (sy === null || ey === null) {
      sy = inferYear(start.month);
      ey = end ? inferYear(end.month) : sy;
      inferred = true;
      confidence = 0.75;
    }
    const endRef = end ?? start;
    let startDate = validDate(sy, start.month, start.day);
    let endDate = validDate(ey, endRef.month, endRef.day);

    // Borrowed or inferred years can put the end before the start across a year boundary.
    if (startDate && endDate && endDate < startDate && (inferred || confidence < 0.9)) {
      if (end && span.start.year === null && span.end?.year !== null) startDate = validDate(sy - 1, start.month, start.day);
      else endDate = validDate(ey + 1, endRef.month, endRef.day);
    }
    if (!startDate || !endDate) {
      warnings.push(`Skipped "${line.slice(0, 80)}": contains a date that does not exist.`);
      continue;
    }
    if (endDate < startDate) {
      warnings.push(`Skipped "${line.slice(0, 80)}": the end date is before the start date.`);
      continue;
    }
    if (!end && SPANNING.includes(type)) confidence = Math.min(confidence, 0.65);

    const key = `${type}|${startDate.toISOString()}|${endDate.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ eventType: type, title: titleFrom(line, span, type), startDate, endDate, confidence, sourceText: line });
  }
  return { events, warnings };
}
