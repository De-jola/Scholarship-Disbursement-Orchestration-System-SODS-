/**
 * Simulated OCR + LLM extraction. No real OCR, LLM or network call is made: results are generated
 * deterministically from the document name and the beneficiary record. Output is always advisory;
 * a human reviewer must approve before a beneficiary can be verified.
 */

export const REQUIRED_FIELDS = [
  "studentName", "matricNumber", "university", "department", "level",
  "academicSession", "cgpa", "academicStatus", "resultDate", "documentType",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  studentName: "Student name", matricNumber: "Matric number", university: "University", department: "Department",
  level: "Level", academicSession: "Academic session", cgpa: "CGPA", academicStatus: "Academic status",
  resultDate: "Result date", documentType: "Document type",
};

export const LOW_CONFIDENCE = 0.8;
export const AI_LABEL = "AI-assisted extraction — human approval required.";

export interface FieldInput {
  fieldName: string;
  value: string;
  confidence: number;
}

export interface PersonRecord {
  fullName: string;
  matricNumber: string;
  universityName: string;
  department: string;
  level: string;
}

export interface ExtractionResult {
  fields: FieldInput[];
  confidence: number;
  unreadable: boolean;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** 1 = identical after normalising case, spacing and word order. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return 1;
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function alterName(name: string): string {
  const parts = name.split(" ");
  const last = parts[parts.length - 1];
  const idx = [...last].findIndex((c, i) => i > 0 && "aeiou".includes(c.toLowerCase()));
  const i = idx === -1 ? last.length - 1 : idx;
  const swap = last[i].toLowerCase() === "o" ? "a" : "o";
  parts[parts.length - 1] = last.slice(0, i) + swap + last.slice(i + 1);
  return parts.join(" ");
}

export function simulateExtraction(input: {
  documentType: string;
  documentName: string;
  person: PersonRecord;
}): ExtractionResult {
  const n = input.documentName.toLowerCase();
  if (/unreadable|blurry|corrupt/.test(n)) return { fields: [], confidence: 0.12, unreadable: true };

  const lowQuality = /low-quality|lowres|low-res|faded/.test(n);
  const mismatch = /name-mismatch|mismatch/.test(n);
  const base = lowQuality ? 0.62 : 0.93;
  const p = input.person;
  const h = hash(input.documentName + p.matricNumber);
  const cgpa = (3 + (h % 190) / 100).toFixed(2);
  const hasGrades = input.documentType !== "COURSE_REGISTRATION_FORM";

  const f = (fieldName: string, value: string, conf = base): FieldInput => ({ fieldName, value, confidence: Math.round(conf * 100) / 100 });
  const fields: FieldInput[] = [
    f("studentName", mismatch ? alterName(p.fullName) : p.fullName, mismatch ? Math.min(base, 0.86) : base),
    f("matricNumber", p.matricNumber),
    f("university", p.universityName, Math.min(0.99, base + 0.03)),
    f("department", p.department),
    f("level", p.level),
    f("academicSession", "2024/2025"),
    f("cgpa", hasGrades ? cgpa : "", hasGrades ? Math.max(0.3, base - 0.04) : 0.3),
    f("academicStatus", hasGrades ? "Good Standing" : "", hasGrades ? base : 0.3),
    f("resultDate", "2025-08-14"),
    f("documentType", input.documentType, 0.97),
  ];
  const present = fields.filter((x) => x.value !== "");
  const confidence = present.reduce((s, x) => s + x.confidence, 0) / present.length;
  return { fields, confidence: Math.round(confidence * 100) / 100, unreadable: false };
}

export interface FieldWarning {
  fieldName: string;
  message: string;
}

const MATRIC_FORMAT = /^[A-Z]{2,8}\/\d{2}\/\d{4,6}$/;

export function validateExtraction(fields: FieldInput[], person: PersonRecord): FieldWarning[] {
  const byName = new Map(fields.map((f) => [f.fieldName, f]));
  const out: FieldWarning[] = [];

  for (const name of REQUIRED_FIELDS) {
    const f = byName.get(name);
    const msgs: string[] = [];
    if (!f || f.value.trim() === "") {
      out.push({ fieldName: name, message: `Missing required field: ${FIELD_LABELS[name]}. Enter the value from the document or request a clearer copy.` });
      continue;
    }
    const v = f.value.trim();

    if (name === "cgpa") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 5) msgs.push("CGPA must be between 0.00 and 5.00.");
    }
    if (name === "academicSession") {
      const m = /^(\d{4})\/(\d{4})$/.exec(v);
      if (!m) msgs.push("Academic session must use the format YYYY/YYYY.");
      else if (Number(m[2]) !== Number(m[1]) + 1) msgs.push("Academic session years must be consecutive (e.g. 2024/2025).");
    }
    if (name === "studentName") {
      const sim = nameSimilarity(v, person.fullName);
      if (sim < 1) msgs.push(`Extracted name differs from beneficiary record (similarity ${Math.round(sim * 100)}%). Confirm against the document.`);
    }
    if (name === "matricNumber") {
      if (!MATRIC_FORMAT.test(v)) msgs.push("Matric number does not match the expected format (e.g. ABC/22/01234).");
      else if (v !== person.matricNumber) msgs.push("Matric number differs from the beneficiary record.");
    }
    if (f.confidence < LOW_CONFIDENCE) msgs.push(`Low confidence (${Math.round(f.confidence * 100)}%): check this value against the document.`);
    if (msgs.length) out.push({ fieldName: name, message: msgs.join(" ") });
  }
  return out;
}
