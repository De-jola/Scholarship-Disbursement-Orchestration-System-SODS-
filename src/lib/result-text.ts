/**
 * Local, rule-based extraction of result-document fields from the document's own text layer (PDF or TXT).
 * No OCR, no external AI: values come from labelled lines such as "Matric No: ABC/22/01234".
 * Fields that cannot be found stay empty so validation reports them as missing for the human reviewer.
 */
import { REQUIRED_FIELDS, type ExtractionResult, type FieldInput } from "@/lib/extraction";

/** A scanned image has no text layer, so there is nothing to read. */
export function hasUsableText(text: string): boolean {
  return text.replace(/[^A-Za-z0-9]/g, "").length >= 20;
}

const LABELLED = 0.93;
const FALLBACK = 0.85;
const MISSING = 0.3;

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
const monthNo = (m: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m.toLowerCase().slice(0, 3)) + 1;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function normaliseDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})\\.?,?\\s+(\\d{4})`, "i").exec(s);
  if (m) return iso(+m[3], monthNo(m[2]), +m[1]);
  m = new RegExp(`^(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i").exec(s);
  if (m) return iso(+m[3], monthNo(m[1]), +m[2]);
  return s;
}

interface Rule {
  field: string;
  labels: string[];
  /** Pulls the value out of what follows the label. */
  pick?: (rest: string) => string | null;
  normalise?: (v: string) => string;
}

const firstToken = (rest: string) => /[A-Za-z0-9][A-Za-z0-9/-]*/.exec(rest)?.[0] ?? null;

const RULES: Rule[] = [
  { field: "studentName", labels: ["student\\s+name", "name\\s+of\\s+student", "candidate\\s+name", "full\\s+name", "name"] },
  { field: "matricNumber", labels: ["matric(?:ulation)?\\s*(?:no\\.?|number)?", "reg(?:istration)?\\s*(?:no\\.?|number)"], pick: firstToken },
  { field: "university", labels: ["university", "institution"] },
  { field: "department", labels: ["department(?:\\s+of)?", "dept\\.?"] },
  { field: "level", labels: ["(?:programme\\s+|current\\s+)?level"], normalise: (v) => (/^\d{3}$/.test(v) ? `${v} Level` : v) },
  { field: "academicSession", labels: ["(?:academic\\s+)?session"], pick: (rest) => /\d{4}\s*[/\-–]\s*\d{4}/.exec(rest)?.[0].replace(/\s+/g, "") ?? null },
  { field: "cgpa", labels: ["cgpa", "gpa", "cumulative\\s+grade\\s+point\\s+average"], pick: (rest) => /\d+(?:\.\d+)?/.exec(rest)?.[0] ?? null },
  { field: "academicStatus", labels: ["(?:academic\\s+)?(?:status|standing)"] },
  { field: "resultDate", labels: ["date\\s+of\\s+result", "result\\s+date", "date\\s+issued", "date"], normalise: normaliseDate },
];

function findLabelled(lines: string[], rule: Rule): string | null {
  for (const label of rule.labels) {
    const re = new RegExp(`^\\s*${label}\\s*(?:[:\\-–]|\\s)\\s*(.+?)\\s*$`, "i");
    // "name" must be followed by a separator so it does not swallow lines like "Namibia ...".
    const strict = new RegExp(`^\\s*${label}\\s*[:\\-–]\\s*(.+?)\\s*$`, "i");
    for (const line of lines) {
      const m = (rule.field === "cgpa" ? re : strict).exec(line);
      if (!m) continue;
      const v = rule.pick ? rule.pick(m[1]) : m[1];
      if (v) return rule.normalise ? rule.normalise(v) : v;
    }
  }
  return null;
}

export function extractResultFields(text: string, documentType: string): ExtractionResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = new Map<string, FieldInput>();

  for (const rule of RULES) {
    const v = findLabelled(lines, rule);
    if (v) out.set(rule.field, { fieldName: rule.field, value: v, confidence: LABELLED });
  }
  if (!out.has("university")) {
    const line = lines.find((l) => /\buniversity\b/i.test(l) && !/[:]/.test(l));
    if (line) out.set("university", { fieldName: "university", value: line, confidence: FALLBACK });
  }
  out.set("documentType", { fieldName: "documentType", value: documentType, confidence: 0.97 });

  const fields: FieldInput[] = REQUIRED_FIELDS.map((name) => out.get(name) ?? { fieldName: name, value: "", confidence: MISSING });
  const confidence = fields.reduce((s, f) => s + f.confidence, 0) / fields.length;
  return { fields, confidence: Math.round(confidence * 100) / 100, unreadable: false };
}
