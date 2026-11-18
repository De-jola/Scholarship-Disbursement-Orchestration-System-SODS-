import { describe, expect, it } from "vitest";
import { extractResultFields, hasUsableText } from "@/lib/result-text";
import { validateExtraction } from "@/lib/extraction";

const val = (r: ReturnType<typeof extractResultFields>, name: string) => r.fields.find((f) => f.fieldName === name)?.value;

const DOC_A = [
  "UNIVERSITY OF LAGOS",
  "OFFICE OF THE REGISTRAR - STATEMENT OF RESULT",
  "Name: Chiamaka Okeke",
  "Matric No: UNILAG/22/01234",
  "Department: Electrical Engineering",
  "Level: 300 Level",
  "Session: 2024/2025",
  "CGPA: 4.12",
  "Academic Status: Good Standing",
  "Date of Result: 14 August 2025",
].join("\n");

const person = { fullName: "Chiamaka Okeke", matricNumber: "UNILAG/22/01234", universityName: "University of Lagos", department: "Electrical Engineering", level: "300 Level" };

describe("extractResultFields: reads values from the uploaded document's text", () => {
  it("extracts every field from a labelled statement of result", () => {
    const r = extractResultFields(DOC_A, "STATEMENT_OF_RESULT");
    expect(val(r, "studentName")).toBe("Chiamaka Okeke");
    expect(val(r, "matricNumber")).toBe("UNILAG/22/01234");
    expect(val(r, "university")).toBe("UNIVERSITY OF LAGOS");
    expect(val(r, "department")).toBe("Electrical Engineering");
    expect(val(r, "level")).toBe("300 Level");
    expect(val(r, "academicSession")).toBe("2024/2025");
    expect(val(r, "cgpa")).toBe("4.12");
    expect(val(r, "academicStatus")).toBe("Good Standing");
    expect(val(r, "resultDate")).toBe("2025-08-14");
    expect(val(r, "documentType")).toBe("STATEMENT_OF_RESULT");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("is NOT static: a different document gives different values", () => {
    const other = DOC_A.replace("Chiamaka Okeke", "Tunde Bakare").replace("4.12", "3.05").replace("UNILAG/22/01234", "UNILAG/21/00077");
    const r = extractResultFields(other, "TRANSCRIPT");
    expect(val(r, "studentName")).toBe("Tunde Bakare");
    expect(val(r, "cgpa")).toBe("3.05");
    expect(val(r, "matricNumber")).toBe("UNILAG/21/00077");
    expect(val(r, "documentType")).toBe("TRANSCRIPT");
  });

  it("accepts common label variants", () => {
    const r = extractResultFields(["Student Name: Amina Yusuf", "Matriculation Number: BUK/20/00555", "GPA - 3.80", "Academic Session: 2023/2024", "Programme Level: 400"].join("\n"), "TRANSCRIPT");
    expect(val(r, "studentName")).toBe("Amina Yusuf");
    expect(val(r, "matricNumber")).toBe("BUK/20/00555");
    expect(val(r, "cgpa")).toBe("3.80");
    expect(val(r, "academicSession")).toBe("2023/2024");
  });

  it("leaves absent fields empty with low confidence so validation reports them as missing", () => {
    const r = extractResultFields(DOC_A.replace("CGPA: 4.12\n", "").replace("Academic Status: Good Standing\n", ""), "STATEMENT_OF_RESULT");
    expect(val(r, "cgpa")).toBe("");
    const warnings = validateExtraction(r.fields, person);
    expect(warnings.find((w) => w.fieldName === "cgpa")?.message).toMatch(/missing/i);
  });

  it("flows into the existing validation rules (name mismatch, bad CGPA, bad session)", () => {
    const bad = DOC_A.replace("Chiamaka Okeke", "Chiamaka Okoke").replace("4.12", "6.40").replace("2024/2025", "2024-2025");
    const w = validateExtraction(extractResultFields(bad, "STATEMENT_OF_RESULT").fields, person);
    expect(w.find((x) => x.fieldName === "studentName")?.message).toMatch(/differs/);
    expect(w.find((x) => x.fieldName === "cgpa")?.message).toMatch(/between 0\.00 and 5\.00/);
    expect(w.find((x) => x.fieldName === "academicSession")?.message).toMatch(/YYYY\/YYYY/);
    expect(validateExtraction(extractResultFields(DOC_A, "STATEMENT_OF_RESULT").fields, person)).toEqual([]);
  });

  it("gives a much lower overall confidence when few fields can be found", () => {
    const sparse = extractResultFields("Name: Someone\nrandom words here", "STATEMENT_OF_RESULT");
    expect(sparse.confidence).toBeLessThan(0.8);
  });
});

describe("hasUsableText", () => {
  it("rejects empty or near-empty text (a scanned image has no text layer)", () => {
    expect(hasUsableText("")).toBe(false);
    expect(hasUsableText("  \n ")).toBe(false);
    expect(hasUsableText("ab")).toBe(false);
    expect(hasUsableText(DOC_A)).toBe(true);
  });
});
