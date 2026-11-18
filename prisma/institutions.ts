/**
 * Loader for the bundled open dataset of Nigerian universities (data/nigerian_universities_faculties.csv,
 * CC0, see data/SOURCES.md). Only name, state, website and category are used by SDOS.
 */

export interface InstitutionRecord {
  name: string;
  category: "Federal" | "State" | "Private";
  state: string;
  yearEstablished: number | null;
  websiteUrl: string;
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function stateFromLocation(location: string): string {
  const s = location.trim();
  if (/^FCT/i.test(s)) return "FCT";
  return s.replace(/\s+State$/i, "");
}

export function parseUniversities(csv: string): InstitutionRecord[] {
  const [header, ...rows] = parseCsv(csv);
  const col = (n: string) => header.findIndex((h) => h.trim() === n);
  const iName = col("University Name"), iCat = col("Category"), iLoc = col("Location"), iYear = col("Year Established"), iWeb = col("Website");
  if ([iName, iCat, iLoc].some((i) => i < 0)) throw new Error("Unexpected universities CSV header.");
  return rows
    .map((r) => ({
      name: r[iName].trim(),
      category: r[iCat].trim() as InstitutionRecord["category"],
      state: stateFromLocation(r[iLoc]),
      yearEstablished: /^\d{4}$/.test((r[iYear] ?? "").trim()) ? Number(r[iYear].trim()) : null,
      websiteUrl: (r[iWeb] ?? "").trim(),
    }))
    .filter((r) => r.name);
}

/** Widely used acronyms for the programme partners. */
export const KNOWN_SHORT_NAMES: Record<string, string> = {
  "Ahmadu Bello University, Zaria": "ABU",
  "Delta State University, Abraka": "DELSU",
  "Rivers State University": "RSU",
  "Federal University of Technology, Minna": "FUTMINNA",
  "University of Jos": "UNIJOS",
  "University of Lagos": "UNILAG",
  "Bayero University, Kano": "BUK",
  "University of Nigeria, Nsukka": "UNN",
};

const STOP = new Set(["of", "the", "and", "for", "in"]);

export function shortNameFor(name: string, used: Set<string>): string {
  let base = KNOWN_SHORT_NAMES[name];
  if (!base) {
    const initials = name.split(",")[0].split(/[\s-]+/).filter((w) => w && !STOP.has(w.toLowerCase())).map((w) => w[0].toUpperCase()).join("").replace(/[^A-Z0-9]/g, "");
    base = initials || "UNI";
  }
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}${n}`;
  used.add(candidate);
  return candidate;
}
