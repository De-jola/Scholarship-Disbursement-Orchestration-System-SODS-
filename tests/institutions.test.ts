import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, parseUniversities, shortNameFor, stateFromLocation } from "../prisma/institutions";

const csvPath = path.resolve(__dirname, "..", "data", "nigerian_universities_faculties.csv");

describe("parseCsv", () => {
  it("handles quoted fields containing commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n');
    expect(rows).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
  it("ignores a UTF-8 byte-order mark and blank trailing lines", () => {
    expect(parseCsv("﻿x,y\n\n")).toEqual([["x", "y"]]);
  });
});

describe("stateFromLocation", () => {
  it("strips the State suffix and normalises FCT", () => {
    expect(stateFromLocation("Kaduna State")).toBe("Kaduna");
    expect(stateFromLocation("FCT Abuja")).toBe("FCT");
  });
});

describe("shortNameFor", () => {
  it("uses well-known acronyms for the programme partners", () => {
    const used = new Set<string>();
    expect(shortNameFor("Ahmadu Bello University, Zaria", used)).toBe("ABU");
    expect(shortNameFor("Federal University of Technology, Minna", used)).toBe("FUTMINNA");
    expect(shortNameFor("University of Lagos", used)).toBe("UNILAG");
  });
  it("derives initials otherwise and guarantees uniqueness", () => {
    const used = new Set<string>();
    const a = shortNameFor("Alpha Beta University, Town One", used);
    const b = shortNameFor("Alpha Beta University, Town Two", used);
    expect(a).toMatch(/^[A-Z0-9]+$/);
    expect(b).not.toBe(a);
  });
});

describe("parseUniversities (bundled dataset)", () => {
  const unis = parseUniversities(readFileSync(csvPath, "utf8"));
  it("reads all 312 universities with valid categories", () => {
    expect(unis).toHaveLength(312);
    expect(unis.every((u) => ["Federal", "State", "Private"].includes(u.category))).toBe(true);
  });
  it("keeps names, states and websites for known institutions", () => {
    const abu = unis.find((u) => u.name === "Ahmadu Bello University, Zaria")!;
    expect(abu.state).toBe("Kaduna");
    expect(abu.websiteUrl).toBe("https://www.abu.edu.ng");
    expect(abu.yearEstablished).toBe(1962);
  });
  it("tolerates a missing website", () => {
    expect(unis.some((u) => u.websiteUrl === "")).toBe(true);
  });
  it("produces unique names", () => {
    expect(new Set(unis.map((u) => u.name)).size).toBe(unis.length);
  });
});
