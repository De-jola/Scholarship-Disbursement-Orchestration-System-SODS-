import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createSeededDb } from "./helpers/test-db";
import { makePdf } from "./helpers/make-pdf";

// Server actions read the signed-in role from a cookie and revalidate Next's cache. Stub both.
let role = "ADMIN";
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (name: string) => (name === "sdos_role" ? { value: role } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

let prisma: PrismaClient;
beforeAll(async () => {
  prisma = await createSeededDb("actions");
}, 120_000);
afterAll(async () => prisma.$disconnect());

/** File from raw bytes (TS 6 types Uint8Array parts strictly). */
const fileOf = (bytes: Uint8Array, name: string, type: string) => new File([bytes as unknown as BlobPart], name, { type });

function form(entries: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const csv = "eventType,title,startDate,endDate,sourceText\nREGISTRATION,Course registration,2026-11-03,2026-11-21,Reg 3-21 Nov\nSESSION_END,End of session,2027-07-30,2027-07-30,End";

describe("calendar upload action (the AI extraction the reviewer sees)", () => {
  it("extracts the actual events from an uploaded PDF, and different PDFs give different results", async () => {
    const { uploadCalendarAction } = await import("@/app/actions/calendars");
    const u = await prisma.university.findFirstOrThrow({ where: { shortName: "ABU" } });
    const pdf = makePdf(["Resumption: 2nd November 2026", "Course registration: 9th - 27th November 2026", "Examinations: 22 March - 16 April 2027", "End of session: 30 July 2027"]);
    const r = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: fileOf(pdf, "senate-calendar-2026-27.pdf", "application/pdf") }));
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Extracted 4 calendar events/);
    const cal = await prisma.academicCalendar.findFirstOrThrow({ where: { universityId: u.id, session: "2026/2027" }, include: { events: true } });
    expect(cal.reviewStatus).toBe("PENDING_REVIEW");
    expect(cal.events.find((e) => e.eventType === "REGISTRATION")!.startDate.toISOString().slice(0, 10)).toBe("2026-11-09");

    const other = makePdf(["Registration: 1st - 18th December 2026", "End of session: 15 September 2027"]);
    const u2 = await prisma.university.findFirstOrThrow({ where: { shortName: "DELSU" } });
    const r2 = await uploadCalendarAction(form({ universityId: u2.id, session: "2026/2027", file: fileOf(other, "delsu.pdf", "application/pdf") }));
    expect(r2.message).toMatch(/Extracted 2 calendar events/);
  });

  it("reports an unreadable PDF instead of inventing events", async () => {
    const { uploadCalendarAction } = await import("@/app/actions/calendars");
    const u = await prisma.university.findFirstOrThrow({ where: { shortName: "RSU" } });
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    const r = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: fileOf(bytes, "scan.pdf", "application/pdf") }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No text could be read/);
    expect(await prisma.academicCalendar.count({ where: { universityId: u.id, session: "2026/2027" } })).toBe(0);
  });

  it("extracts events from CSV and JSON uploads", async () => {
    const { uploadCalendarAction } = await import("@/app/actions/calendars");
    const u = await prisma.university.findFirstOrThrow({ where: { shortName: "BUK" } });
    const r1 = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: new File([csv], "buk.csv", { type: "text/csv" }) }));
    expect(r1.ok).toBe(true);
    const json = JSON.stringify([{ eventType: "REGISTRATION", title: "Reg", startDate: "2026-11-03", endDate: "2026-11-21" }]);
    const r2 = await uploadCalendarAction(form({ universityId: u.id, session: "2027/2028", file: new File([json], "buk.json", { type: "application/json" }) }));
    expect(r2.ok).toBe(true);
  });

  it("explains problems instead of failing silently", async () => {
    const { uploadCalendarAction } = await import("@/app/actions/calendars");
    const u = await prisma.university.findFirstOrThrow({ where: { shortName: "UNN" } });
    const empty = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: new File([], "x.csv") }));
    expect(empty.ok).toBe(false);
    expect(empty.message).toMatch(/choose/i);
    const badSession = await uploadCalendarAction(form({ universityId: u.id, session: "2026-27", file: new File([csv], "x.csv") }));
    expect(badSession.message).toMatch(/YYYY\/YYYY|2025\/2026/);
    const bad = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: new File(["a,b\n1,2"], "x.csv") }));
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/column/i);
    const exe = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: new File(["x"], "x.exe") }));
    expect(exe.message).toMatch(/Unsupported/);
  });

  it("is refused for the Finance Approver role", async () => {
    const { uploadCalendarAction } = await import("@/app/actions/calendars");
    role = "FINANCE_APPROVER";
    const u = await prisma.university.findFirstOrThrow({ where: { shortName: "UNN" } });
    const r = await uploadCalendarAction(form({ universityId: u.id, session: "2026/2027", file: new File([csv], "x.csv") }));
    role = "ADMIN";
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not permitted/i);
  });
});

describe("result document upload and extraction actions", () => {
  it("uploads and extracts for a beneficiary awaiting a result, leaving them in human review", async () => {
    const { uploadResultDocumentAction } = await import("@/app/actions/verification");
    const b = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: "AWAITING_RESULT", university: { shortName: "DELSU" } } });
    const r = await uploadResultDocumentAction(b.id, "STATEMENT_OF_RESULT", "NAME_MISMATCH");
    expect(r.ok).toBe(true);
    const after = await prisma.beneficiary.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.verificationStatus).toBe("REVIEW_PENDING");
    expect(await prisma.extractedField.count({ where: { submission: { beneficiaryId: b.id } } })).toBe(10);
  });

  it("works for every document type and scenario", async () => {
    const { uploadResultDocumentAction } = await import("@/app/actions/verification");
    const people = await prisma.beneficiary.findMany({ where: { verificationStatus: { in: ["AWAITING_RESULT", "NOT_STARTED"] } }, take: 4 });
    const combos = [["TRANSCRIPT", "CLEAN"], ["COURSE_REGISTRATION_FORM", "CLEAN"], ["STATEMENT_OF_RESULT", "LOW_QUALITY"], ["STATEMENT_OF_RESULT", "UNREADABLE"]] as const;
    for (const [i, [type, scenario]] of combos.entries()) {
      const r = await uploadResultDocumentAction(people[i].id, type, scenario);
      expect(r, `${type}/${scenario}`).toMatchObject({ ok: true });
    }
  });

  it("runs extraction for a document that was uploaded but not yet extracted", async () => {
    const { runExtractionAction } = await import("@/app/actions/verification");
    const sub = await prisma.resultSubmission.findFirstOrThrow({ where: { status: "UPLOADED" } });
    const r = await runExtractionAction(sub.id);
    expect(r.ok).toBe(true);
    expect((await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).not.toBe("UPLOADED");
  });
});

describe("result document file upload action", () => {
  const lines = (name: string, matric: string, dept: string, level: string, uni: string, cgpa: string) => [
    uni.toUpperCase(), "STATEMENT OF RESULT", "Name: " + name, "Matric No: " + matric, "Department: " + dept, "Level: " + level,
    "Session: 2024/2025", "CGPA: " + cgpa, "Academic Status: Good Standing", "Date of Result: 14 August 2025"];

  it("reads a real PDF: different files give different extracted values", async () => {
    const { uploadResultFileAction } = await import("@/app/actions/verification");
    const people = await prisma.beneficiary.findMany({ where: { verificationStatus: { in: ["AWAITING_RESULT", "NOT_STARTED"] } }, include: { university: true }, take: 2 });
    const [a, b] = people;
    const pa = makePdf(lines(a.fullName, a.matricNumber, a.department, a.level, a.university.name, "4.31"));
    const pb = makePdf(lines(b.fullName, b.matricNumber, b.department, b.level, b.university.name, "2.74"));
    const ra = await uploadResultFileAction(form({ beneficiaryId: a.id, documentType: "STATEMENT_OF_RESULT", file: fileOf(pa, "a.pdf", "application/pdf") }));
    const rb = await uploadResultFileAction(form({ beneficiaryId: b.id, documentType: "STATEMENT_OF_RESULT", file: fileOf(pb, "b.pdf", "application/pdf") }));
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    const cgpa = async (id: string) => (await prisma.extractedField.findFirstOrThrow({ where: { fieldName: "cgpa", submission: { beneficiaryId: id } } })).extractedValue;
    expect(await cgpa(a.id)).toBe("4.31");
    expect(await cgpa(b.id)).toBe("2.74");
  });

  it("explains an unreadable scan and rejects unsupported file types", async () => {
    const { uploadResultFileAction } = await import("@/app/actions/verification");
    const b = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: { in: ["AWAITING_RESULT", "NOT_STARTED"] } } });
    const junk = new Uint8Array(4000).map((_, i) => (i * 13) % 256);
    const scan = await uploadResultFileAction(form({ beneficiaryId: b.id, documentType: "TRANSCRIPT", file: fileOf(junk, "scan.pdf", "application/pdf") }));
    expect(scan.message).toMatch(/could not be read|clearer copy/i);
    const b2 = await prisma.beneficiary.findFirstOrThrow({ where: { verificationStatus: { in: ["AWAITING_RESULT", "NOT_STARTED"] } } });
    const img = await uploadResultFileAction(form({ beneficiaryId: b2.id, documentType: "TRANSCRIPT", file: fileOf(junk, "photo.jpg", "image/jpeg") }));
    expect(img.ok).toBe(false);
    expect(img.message).toMatch(/OCR|PDF/);
    const none = await uploadResultFileAction(form({ beneficiaryId: b2.id, documentType: "TRANSCRIPT" } as never));
    expect(none.ok).toBe(false);
  });
});
