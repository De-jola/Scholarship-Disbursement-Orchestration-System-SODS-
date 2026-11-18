import { describe, expect, it } from "vitest";
import { nameSimilarity, simulateExtraction, validateExtraction, REQUIRED_FIELDS, type FieldInput } from "@/lib/extraction";

const person = { fullName: "Chinedu Okeke", matricNumber: "NSU/22/01037", universityName: "Northbridge State University", department: "Economics", level: "300 Level" };

const clean = (over: Partial<Record<string, string>> = {}, conf = 0.93): FieldInput[] =>
  Object.entries({
    studentName: person.fullName, matricNumber: person.matricNumber, university: person.universityName, department: person.department,
    level: person.level, academicSession: "2024/2025", cgpa: "4.12", academicStatus: "Good Standing", resultDate: "2025-08-14",
    documentType: "STATEMENT_OF_RESULT", ...over,
  }).map(([fieldName, value]) => ({ fieldName, value: value ?? "", confidence: conf }));

describe("nameSimilarity", () => {
  it("is 1 for identical names regardless of case, spacing or order", () => {
    expect(nameSimilarity("Chinedu Okeke", "  CHINEDU   okeke ")).toBe(1);
    expect(nameSimilarity("Chinedu Okeke", "Okeke Chinedu")).toBe(1);
  });
  it("is high but below 1 for a one-letter difference, and low for different names", () => {
    const near = nameSimilarity("Chinedu Okeke", "Chinedu Okoke");
    expect(near).toBeGreaterThan(0.85);
    expect(near).toBeLessThan(1);
    expect(nameSimilarity("Chinedu Okeke", "Amina Yusuf")).toBeLessThan(0.5);
  });
});

describe("simulateExtraction", () => {
  it("returns every required field with high confidence for a clean statement of result", () => {
    const r = simulateExtraction({ documentType: "STATEMENT_OF_RESULT", documentName: "result.pdf", person });
    expect(r.unreadable).toBe(false);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    for (const f of REQUIRED_FIELDS) expect(r.fields.find((x) => x.fieldName === f)?.value).toBeTruthy();
    expect(r.fields.find((x) => x.fieldName === "studentName")?.value).toBe(person.fullName);
  });

  it("is deterministic for the same input", () => {
    const a = simulateExtraction({ documentType: "TRANSCRIPT", documentName: "t.pdf", person });
    expect(simulateExtraction({ documentType: "TRANSCRIPT", documentName: "t.pdf", person })).toEqual(a);
  });

  it("alters the extracted name when the document name signals a mismatch scenario", () => {
    const r = simulateExtraction({ documentType: "STATEMENT_OF_RESULT", documentName: "sor-name-mismatch.pdf", person });
    expect(r.fields.find((x) => x.fieldName === "studentName")?.value).not.toBe(person.fullName);
  });

  it("produces low overall confidence for a low-quality scan", () => {
    const r = simulateExtraction({ documentType: "STATEMENT_OF_RESULT", documentName: "sor-low-quality.pdf", person });
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.unreadable).toBe(false);
  });

  it("reports an unreadable document with no usable fields", () => {
    const r = simulateExtraction({ documentType: "STATEMENT_OF_RESULT", documentName: "sor-unreadable.pdf", person });
    expect(r.unreadable).toBe(true);
    expect(r.confidence).toBeLessThan(0.2);
    expect(r.fields).toHaveLength(0);
  });

  it("omits CGPA and academic status on a course registration form", () => {
    const r = simulateExtraction({ documentType: "COURSE_REGISTRATION_FORM", documentName: "crf.pdf", person });
    expect(r.fields.find((x) => x.fieldName === "cgpa")?.value ?? "").toBe("");
  });
});

describe("validateExtraction", () => {
  const warningsFor = (fields: FieldInput[], field: string) => validateExtraction(fields, person).find((w) => w.fieldName === field)?.message;

  it("passes a clean extraction with no warnings", () => {
    expect(validateExtraction(clean(), person)).toEqual([]);
  });
  it("rejects CGPA outside 0.00-5.00 or non-numeric", () => {
    expect(warningsFor(clean({ cgpa: "5.40" }), "cgpa")).toMatch(/between 0\.00 and 5\.00/);
    expect(warningsFor(clean({ cgpa: "-0.1" }), "cgpa")).toMatch(/between 0\.00 and 5\.00/);
    expect(warningsFor(clean({ cgpa: "abc" }), "cgpa")).toMatch(/between 0\.00 and 5\.00/);
    expect(warningsFor(clean({ cgpa: "5.00" }), "cgpa")).toBeUndefined();
    expect(warningsFor(clean({ cgpa: "0.00" }), "cgpa")).toBeUndefined();
  });
  it("requires academic session in YYYY/YYYY format with consecutive years", () => {
    expect(warningsFor(clean({ academicSession: "2024-2025" }), "academicSession")).toMatch(/YYYY\/YYYY/);
    expect(warningsFor(clean({ academicSession: "2024/2026" }), "academicSession")).toMatch(/consecutive/);
    expect(warningsFor(clean({ academicSession: "2024/2025" }), "academicSession")).toBeUndefined();
  });
  it("warns when the extracted name differs from the beneficiary record", () => {
    expect(warningsFor(clean({ studentName: "Chinedu Okoke" }), "studentName")).toMatch(/differs from beneficiary record/);
  });
  it("warns on malformed matric numbers and on mismatch with the record", () => {
    expect(warningsFor(clean({ matricNumber: "12345" }), "matricNumber")).toMatch(/format/i);
    expect(warningsFor(clean({ matricNumber: "NSU/22/09999" }), "matricNumber")).toMatch(/differs/);
  });
  it("warns for each missing required field", () => {
    expect(warningsFor(clean({ cgpa: "" }), "cgpa")).toMatch(/missing/i);
    expect(validateExtraction(clean().filter((f) => f.fieldName !== "department"), person).some((w) => w.fieldName === "department" && /missing/i.test(w.message))).toBe(true);
  });
  it("warns on low confidence (<0.80) per field", () => {
    expect(validateExtraction(clean({}, 0.79), person).every((w) => /low confidence/i.test(w.message))).toBe(true);
    expect(validateExtraction(clean({}, 0.8), person)).toEqual([]);
  });
});
