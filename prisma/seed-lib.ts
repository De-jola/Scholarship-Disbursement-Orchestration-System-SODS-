import type { PrismaClient } from "@prisma/client";

/** Fixed per-beneficiary instalment used throughout the demo (NGN). */
export const STANDARD_AMOUNT = 150_000;
export const SESSION = "2025/2026";

const d = (s: string) => new Date(`${s}T09:00:00.000Z`);

const FIRST = [
  "Adaeze", "Tunde", "Chinedu", "Amina", "Emeka", "Funmilayo", "Ibrahim", "Ngozi", "Segun", "Zainab",
  "Obinna", "Hauwa", "Kelechi", "Yetunde", "Musa", "Chiamaka", "Damilola", "Fatima", "Ifeanyi", "Bukola",
  "Uche", "Halima", "Tobiloba", "Nneka", "Sani", "Folake",
];
const LAST = [
  "Okonkwo", "Bakare", "Eze", "Abdullahi", "Nwosu", "Adeyemi", "Danjuma", "Okafor", "Balogun", "Yusuf",
  "Ogunleye", "Ibekwe", "Lawal", "Chukwu", "Afolabi", "Garba", "Onyeama", "Salami", "Mbah", "Oladipo",
  "Usman", "Anyanwu", "Fashola", "Bello", "Obi", "Adewale", "Umeh",
];

interface UniSpec {
  shortName: string;
  name: string;
  state: string;
  site: string;
  matric: string;
  departments: string[];
}

const UNIS: UniSpec[] = [
  { shortName: "NSU", name: "Northbridge State University", state: "Kaduna", site: "https://northbridge-su.example", matric: "NSU", departments: ["Chemical Engineering", "Economics", "Mathematics"] },
  { shortName: "DPU", name: "Delta Plains University", state: "Delta", site: "https://deltaplains.example", matric: "DPU", departments: ["Petroleum Engineering", "Geology", "Accounting"] },
  { shortName: "CUT", name: "Coastal University of Technology", state: "Rivers", site: "https://coastal-tech.example", matric: "CUT", departments: ["Marine Engineering", "Computer Science", "Mechanical Engineering"] },
  { shortName: "RFU", name: "Riverside Federal University", state: "Niger", site: "https://riverside-fu.example", matric: "RFU", departments: ["Civil Engineering", "Agricultural Science", "Physics"] },
  { shortName: "HSU", name: "Highland State University", state: "Plateau", site: "https://highland-su.example", matric: "HSU", departments: ["Mining Engineering", "Biochemistry", "Statistics"] },
  { shortName: "LCU", name: "Lagoon City University", state: "Lagos", site: "https://lagooncity.example", matric: "LCU", departments: ["Electrical Engineering", "Business Administration", "Law"] },
  { shortName: "SVU", name: "Savannah University", state: "Kano", site: "https://savannah-uni.example", matric: "SVU", departments: ["Agricultural Engineering", "Microbiology", "Sociology"] },
  { shortName: "UUS", name: "Unity University of Science", state: "Enugu", site: "https://unity-science.example", matric: "UUS", departments: ["Industrial Chemistry", "Computer Engineering", "Pharmacy"] },
];

type VS =
  | "NOT_STARTED" | "AWAITING_RESULT" | "DOCUMENT_SUBMITTED" | "EXTRACTED"
  | "REVIEW_PENDING" | "VERIFIED" | "EXCEPTION" | "REJECTED";

/** Verification status per slot, per university. Length defines head-count. */
const PLAN: Record<string, VS[]> = {
  NSU: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "REVIEW_PENDING", "VERIFIED"],
  DPU: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "AWAITING_RESULT"],
  CUT: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "EXCEPTION", "EXTRACTED"],
  RFU: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "REVIEW_PENDING", "DOCUMENT_SUBMITTED", "NOT_STARTED", "AWAITING_RESULT", "EXTRACTED"],
  HSU: ["NOT_STARTED", "AWAITING_RESULT", "AWAITING_RESULT", "REJECTED", "EXCEPTION", "VERIFIED"],
  LCU: ["VERIFIED", "VERIFIED", "AWAITING_RESULT", "AWAITING_RESULT", "NOT_STARTED", "NOT_STARTED"],
  SVU: ["NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "AWAITING_RESULT", "DOCUMENT_SUBMITTED", "EXTRACTED"],
  UUS: ["VERIFIED", "VERIFIED", "REVIEW_PENDING", "REVIEW_PENDING", "NOT_STARTED", "AWAITING_RESULT"],
};

const pad = (n: number, w: number) => String(n).padStart(w, "0");

interface FieldSeed {
  fieldName: string;
  extractedValue: string;
  confidence: number;
  warning?: string;
}

function buildFields(opts: {
  name: string; matric: string; uni: string; dept: string; level: string; confidence: number;
  nameOverride?: string; nameWarning?: string; documentType: string;
}): FieldSeed[] {
  const c = opts.confidence;
  return [
    { fieldName: "studentName", extractedValue: opts.nameOverride ?? opts.name, confidence: opts.nameOverride ? Math.min(c, 0.86) : c, warning: opts.nameWarning },
    { fieldName: "matricNumber", extractedValue: opts.matric, confidence: c },
    { fieldName: "university", extractedValue: opts.uni, confidence: Math.min(0.99, c + 0.03) },
    { fieldName: "department", extractedValue: opts.dept, confidence: c },
    { fieldName: "level", extractedValue: opts.level, confidence: c },
    { fieldName: "academicSession", extractedValue: "2024/2025", confidence: c },
    { fieldName: "cgpa", extractedValue: (3.2 + (opts.name.length % 15) / 10).toFixed(2), confidence: Math.max(0.3, c - 0.05) },
    { fieldName: "academicStatus", extractedValue: "Good Standing", confidence: c },
    { fieldName: "resultDate", extractedValue: "2025-08-14", confidence: c },
    { fieldName: "documentType", extractedValue: opts.documentType, confidence: 0.97 },
  ];
}

export async function runSeed(prisma: PrismaClient): Promise<void> {
  // Clean slate (child tables first).
  await prisma.auditLog.deleteMany();
  await prisma.paymentBatchItem.deleteMany();
  await prisma.paymentBatch.deleteMany();
  await prisma.fundAllocation.deleteMany();
  await prisma.extractedField.deleteMany();
  await prisma.resultSubmission.deleteMany();
  await prisma.verificationEvent.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.academicCalendar.deleteMany();
  await prisma.university.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({ data: { name: "Adaeze Okonkwo", email: "adaeze.okonkwo@sdos.example.test", role: "ADMIN" } });
  const finance = await prisma.user.create({ data: { name: "Tunde Bakare", email: "tunde.bakare@sdos.example.test", role: "FINANCE_APPROVER" } });

  const uniIds: Record<string, string> = {};
  for (const u of UNIS) {
    const row = await prisma.university.create({
      data: { name: u.name, shortName: u.shortName, state: u.state, websiteUrl: u.site },
    });
    uniIds[u.shortName] = row.id;
  }

  // ---- Academic calendars ----------------------------------------------
  type Ev = [string, string, string, string, number, string];
  const mkCalendar = async (
    short: string, session: string, status: "APPROVED" | "PENDING_REVIEW" | "DRAFT",
    sourceType: "MANUAL_ENTRY" | "CSV_UPLOAD" | "SIMULATED_PORTAL", sourceName: string,
    events: Ev[], approvedAt?: string,
  ) => {
    const cal = await prisma.academicCalendar.create({
      data: {
        universityId: uniIds[short], session, reviewStatus: status, sourceType, sourceName,
        approvedByUserId: status === "APPROVED" ? admin.id : null,
        approvedByName: status === "APPROVED" ? admin.name : null,
        approvedAt: approvedAt ? d(approvedAt) : null,
        events: {
          create: events.map(([eventType, title, s, e, confidence, sourceText]) => ({
            eventType: eventType as never, title, startDate: d(s), endDate: d(e), confidence, sourceText,
          })),
        },
      },
    });
    return cal;
  };

  await mkCalendar("NSU", SESSION, "APPROVED", "CSV_UPLOAD", "nsu-calendar-2025-26.csv", [
    ["RESUMPTION", "Resumption of returning students", "2025-09-22", "2025-09-26", 0.97, "Returning students resume: 22 Sept 2025"],
    ["REGISTRATION", "Course registration (October window)", "2025-10-06", "2025-10-31", 0.96, "Registration opens 6 Oct, closes 31 Oct 2025"],
    ["LECTURES", "First-semester lectures", "2025-10-13", "2026-02-06", 0.94, "Lectures: 13 Oct 2025 - 6 Feb 2026"],
    ["EXAMINATION", "First-semester examinations", "2026-02-16", "2026-03-13", 0.93, "Exams: 16 Feb - 13 Mar 2026"],
    ["SESSION_END", "End of session", "2026-07-31", "2026-07-31", 0.9, "Session ends 31 Jul 2026"],
  ], "2025-09-29");
  await mkCalendar("DPU", SESSION, "APPROVED", "SIMULATED_PORTAL", "Simulated portal feed: deltaplains.example/calendar", [
    ["RESUMPTION", "Resumption", "2025-11-17", "2025-11-21", 0.9, "Resumption week beginning 17 Nov 2025"],
    ["REGISTRATION", "Course registration (December window)", "2025-12-01", "2025-12-19", 0.95, "Online registration 1 - 19 Dec 2025"],
    ["LECTURES", "First-semester lectures", "2025-12-08", "2026-04-10", 0.92, "Lectures: 8 Dec 2025 - 10 Apr 2026"],
    ["SESSION_END", "End of session", "2026-09-04", "2026-09-04", 0.88, "Session closes 4 Sept 2026"],
  ], "2025-11-24");
  await mkCalendar("CUT", SESSION, "APPROVED", "MANUAL_ENTRY", "Manual entry by Scholarship Administrator", [
    ["RESUMPTION", "Delayed resumption (strike recovery)", "2026-01-05", "2026-01-09", 0.85, "Senate notice: resumption deferred to 5 Jan 2026"],
    ["REGISTRATION", "Course registration (January window)", "2026-01-12", "2026-01-30", 0.9, "Registration 12 - 30 Jan 2026"],
    ["LECTURES", "First-semester lectures", "2026-01-19", "2026-05-22", 0.9, "Lectures begin 19 Jan 2026"],
    ["SESSION_END", "End of session", "2026-10-30", "2026-10-30", 0.8, "Session end 30 Oct 2026"],
  ], "2025-12-18");
  await mkCalendar("RFU", SESSION, "APPROVED", "CSV_UPLOAD", "rfu-calendar-2025-26.csv", [
    ["RESUMPTION", "Resumption", "2025-11-03", "2025-11-07", 0.95, "Resumption: 3 Nov 2025"],
    ["REGISTRATION", "Course registration", "2025-11-10", "2025-11-28", 0.95, "Registration 10 - 28 Nov 2025"],
    ["LECTURES", "First-semester lectures", "2025-11-17", "2026-03-06", 0.93, "Lectures 17 Nov 2025 - 6 Mar 2026"],
    ["SESSION_END", "End of session", "2026-08-14", "2026-08-14", 0.9, "Session ends 14 Aug 2026"],
  ], "2025-11-05");
  await mkCalendar("HSU", SESSION, "PENDING_REVIEW", "CSV_UPLOAD", "hsu-calendar-draft.csv", [
    ["REGISTRATION", "Course registration", "2026-02-02", "2026-02-20", 0.71, "Reg. period tentatively 2 - 20 Feb 2026"],
    ["LECTURES", "First-semester lectures", "2026-02-09", "2026-06-12", 0.68, "Lectures (tentative) from 9 Feb 2026"],
    ["SESSION_END", "End of session", "2026-11-27", "2026-11-27", 0.62, "Session end tbc"],
  ]);
  await mkCalendar("LCU", "2024/2025", "APPROVED", "CSV_UPLOAD", "lcu-calendar-2024-25.csv", [
    ["REGISTRATION", "Course registration", "2024-10-07", "2024-10-25", 0.95, "Registration 7 - 25 Oct 2024"],
    ["SESSION_END", "End of session", "2025-07-25", "2025-07-25", 0.9, "Session ends 25 Jul 2025"],
  ], "2024-10-01");

  // ---- Beneficiaries ----------------------------------------------------
  const clock = new Date("2026-01-12T09:00:00.000Z");
  const ben: Record<string, { id: string; name: string; status: VS }[]> = {};
  let idx = 0;
  const usedNames = new Set<string>();

  for (const u of UNIS) {
    ben[u.shortName] = [];
    const plan = PLAN[u.shortName];
    for (let slot = 0; slot < plan.length; slot++) {
      const status = plan[slot];
      const fullName = `${FIRST[idx % FIRST.length]} ${LAST[idx % LAST.length]}`;
      if (usedNames.has(fullName)) throw new Error(`Duplicate synthetic name ${fullName}`);
      usedNames.add(fullName);
      const dept = u.departments[slot % u.departments.length];
      const level = `${200 + (slot % 4) * 100} Level`;
      const matric = `${u.matric}/${21 + (slot % 4)}/${pad(1000 + idx * 37, 5)}`;
      const ref = `SDOS-${SESSION.slice(0, 4)}-${pad(idx + 1, 4)}`;

      const isDuplicate = u.shortName === "CUT" && slot === 4;
      const isUnreadable = u.shortName === "HSU" && slot === 4;
      const noToken = u.shortName === "LCU" && slot === 1;
      const exceptionType = isDuplicate ? "DUPLICATE_SCHOLARSHIP" : isUnreadable ? "UNREADABLE_DOCUMENT" : null;

      const created = await prisma.beneficiary.create({
        data: {
          applicationRef: ref, fullName,
          email: `${fullName.toLowerCase().replace(" ", ".")}${idx}@example.test`,
          phone: `+234 800 555 ${pad(100 + idx, 4)}`,
          universityId: uniIds[u.shortName], department: dept, level, academicSession: SESSION, matricNumber: matric,
          otherScholarshipDeclaration: isDuplicate,
          verificationStatus: status,
          exceptionType,
          exceptionNote: isDuplicate
            ? "Beneficiary declared a concurrent state bursary on the annual declaration form."
            : isUnreadable ? "Uploaded result image is too blurred to read; clearer copy required." : null,
          verifiedAt: status === "VERIFIED" ? new Date(clock.getTime() - (20 + idx) * 86_400_000) : null,
          bankAccountToken: noToken ? null : `tok_demo_${pad(idx + 1, 4)}`,
          bankAccountMasked: `****${pad(1200 + idx * 13, 4).slice(-4)}`,
          lastActivityAt: new Date(clock.getTime() - ((idx % 12) + 1) * 86_400_000),
        },
      });
      ben[u.shortName].push({ id: created.id, name: fullName, status });

      // Result submissions & extracted fields
      const docType = slot % 3 === 0 ? "TRANSCRIPT" : "STATEMENT_OF_RESULT";
      const base = {
        beneficiaryId: created.id, documentType: docType as never,
        documentName: `${ref}-result.pdf`, fileUrl: `/simulated-uploads/${ref}-result.pdf`,
      };
      const addEvent = (eventType: string, actorType: string, actorName: string, details: string, daysAgo: number) =>
        prisma.verificationEvent.create({
          data: { beneficiaryId: created.id, eventType: eventType as never, actorType: actorType as never, actorName, details, createdAt: new Date(clock.getTime() - daysAgo * 86_400_000) },
        });

      const withFields = async (confidence: number, subStatus: string, extra: Partial<{ nameOverride: string; nameWarning: string }> = {}, reviewed = false) => {
        const fields = buildFields({ name: fullName, matric, uni: u.name, dept, level, confidence, documentType: docType, ...extra });
        const sub = await prisma.resultSubmission.create({
          data: {
            ...base, status: subStatus as never, extractionConfidence: confidence,
            extractedJson: JSON.stringify(Object.fromEntries(fields.map((f) => [f.fieldName, f.extractedValue]))),
            reviewerId: reviewed ? admin.id : null, reviewedAt: reviewed ? new Date(clock.getTime() - 15 * 86_400_000) : null,
            reviewerNotes: reviewed ? "Fields match uploaded document." : null,
            fields: {
              create: fields.map((f) => ({
                fieldName: f.fieldName, extractedValue: f.extractedValue, confidence: f.confidence,
                needsReview: f.confidence < 0.8 || !!f.warning, warning: f.warning ?? null,
                status: (reviewed ? "CONFIRMED" : "PENDING") as never,
              })),
            },
          },
        });
        return sub;
      };

      if (status === "VERIFIED") {
        await withFields(0.93, "APPROVED", {}, true);
        await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", `Uploaded ${docType.replace(/_/g, " ").toLowerCase()}`, 25);
        await addEvent("AI_EXTRACTION_COMPLETED", "SYSTEM", "Simulated extraction", "AI-assisted extraction complete (confidence 93%)", 25);
        await addEvent("APPROVED", "ADMIN", admin.name, "Verification approved after human review", 20);
      } else if (status === "DOCUMENT_SUBMITTED") {
        await prisma.resultSubmission.create({ data: { ...base, status: "UPLOADED" } });
        await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", "Document uploaded; awaiting simulated extraction", 2);
      } else if (status === "EXTRACTED") {
        await withFields(0.9, "EXTRACTED");
        await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", "Document uploaded", 3);
        await addEvent("AI_EXTRACTION_COMPLETED", "SYSTEM", "Simulated extraction", "AI-assisted extraction complete (confidence 90%)", 3);
      } else if (status === "REVIEW_PENDING") {
        const lowConf = u.shortName === "RFU" && slot === 5;
        const mismatch = u.shortName === "NSU" && slot === 4;
        if (lowConf) {
          await withFields(0.62, "REVIEW_PENDING");
        } else if (mismatch) {
          const parts = fullName.split(" ");
          await withFields(0.9, "REVIEW_PENDING", {
            nameOverride: `${parts[0]} ${parts[1].slice(0, -1)}${parts[1].endsWith("e") ? "a" : "e"}`,
            nameWarning: "Extracted name differs from beneficiary record. Confirm against the document.",
          });
        } else {
          await withFields(0.88, "REVIEW_PENDING");
        }
        await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", "Document uploaded after university portal delay", 4);
        await addEvent("AI_EXTRACTION_COMPLETED", "SYSTEM", "Simulated extraction", lowConf ? "Extraction complete with low confidence (62%): human review required" : "AI-assisted extraction complete: human review required", 4);
      } else if (status === "REJECTED") {
        await prisma.resultSubmission.create({
          data: { ...base, status: "REJECTED", extractionConfidence: 0.74, reviewerId: admin.id, reviewedAt: new Date(clock.getTime() - 9 * 86_400_000), reviewerNotes: "Document appears altered; matric number does not match enrolment records." },
        });
        await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", "Document uploaded", 12);
        await addEvent("REJECTED", "ADMIN", admin.name, "Verification rejected: document inconsistent with enrolment records", 9);
      } else if (status === "EXCEPTION") {
        if (isUnreadable) {
          await prisma.resultSubmission.create({
            data: { ...base, status: "REJECTED", extractionConfidence: 0.12, reviewerId: admin.id, reviewedAt: new Date(clock.getTime() - 5 * 86_400_000), reviewerNotes: "Document unreadable: request clearer copy." },
          });
          await addEvent("DOCUMENT_UPLOADED", "SYSTEM", "Beneficiary portal", "Document uploaded", 6);
          await addEvent("EXCEPTION_RAISED", "ADMIN", admin.name, "Exception: result document unreadable; clearer copy requested", 5);
        } else {
          await withFields(0.92, "APPROVED", {}, true);
          await addEvent("DUPLICATE_FLAGGED", "SYSTEM", "Rules engine", "Duplicate scholarship declared: beneficiary excluded from automatic batching", 7);
          await addEvent("EXCEPTION_RAISED", "SYSTEM", "Rules engine", "Exception: manual review required", 7);
        }
      }
      idx++;
    }
  }

  // ---- Funds & batches --------------------------------------------------
  const fund = await prisma.fundAllocation.create({
    data: { name: "2025/2026 Programme Fund", session: SESSION, totalAmount: 12_000_000, committedAmount: 0, disbursedAmount: 0, availableAmount: 12_000_000 },
  });

  const mkBatch = async (
    short: string, name: string, scheduled: string, status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "DISBURSEMENT_SIMULATED",
    slots: number[], ref: string | null, approvedAt?: string,
  ) => {
    const people = slots.map((s) => ben[short][s]);
    const itemStatus = status === "DISBURSEMENT_SIMULATED" ? "DISBURSEMENT_SIMULATED" : status === "APPROVED" ? "APPROVED" : "PENDING";
    return prisma.paymentBatch.create({
      data: {
        universityId: uniIds[short], academicSession: SESSION, batchName: name, scheduledDate: d(scheduled), status,
        totalAmount: people.length * STANDARD_AMOUNT, fundAllocationId: fund.id, createdById: admin.id,
        approvedById: approvedAt ? finance.id : null, approvedByName: approvedAt ? finance.name : null,
        approvedAt: approvedAt ? d(approvedAt) : null, paymentReference: ref,
        items: {
          create: people.map((p) => ({
            beneficiaryId: p.id, amount: STANDARD_AMOUNT, status: itemStatus as never,
            paidAt: status === "DISBURSEMENT_SIMULATED" ? d("2025-11-14") : null,
          })),
        },
      },
    });
  };

  const paid = await mkBatch("RFU", "Riverside Federal University - November 2025 cohort", "2025-11-14", "DISBURSEMENT_SIMULATED", [0, 1, 2], "SDOS-SIM-2025-0001", "2025-11-12");
  const approved = await mkBatch("NSU", "Northbridge State University - October 2025 cohort", "2025-10-10", "APPROVED", [0, 1, 2, 3], "SDOS-SIM-2025-0002", "2025-10-08");
  const pending = await mkBatch("DPU", "Delta Plains University - December 2025 cohort", "2025-12-05", "PENDING_APPROVAL", [0, 1, 2, 3, 4], null);
  const draft = await mkBatch("CUT", "Coastal University of Technology - January 2026 cohort", "2026-01-14", "DRAFT", [0, 1, 2, 3], null);

  const committed = approved.totalAmount;
  const disbursed = paid.totalAmount;
  await prisma.fundAllocation.update({
    where: { id: fund.id },
    data: { committedAmount: committed, disbursedAmount: disbursed, availableAmount: fund.totalAmount - committed - disbursed },
  });

  // ---- Audit trail ------------------------------------------------------
  const audit = (
    daysFromClock: number, actor: { name: string; role: string }, action: string, entityType: string,
    details: string, extra: { universityId?: string; paymentBatchId?: string; beneficiaryId?: string } = {},
  ) => prisma.auditLog.create({
    data: { actorName: actor.name, actorRole: actor.role, action, entityType, details, createdAt: new Date(clock.getTime() + daysFromClock * 86_400_000), ...extra },
  });
  const A = { name: admin.name, role: "ADMIN" };
  const F = { name: finance.name, role: "FINANCE_APPROVER" };
  await audit(-108, A, "CALENDAR_UPLOADED", "AcademicCalendar", "Uploaded nsu-calendar-2025-26.csv (5 events extracted)", { universityId: uniIds.NSU });
  await audit(-105, A, "CALENDAR_APPROVED", "AcademicCalendar", "Approved 2025/2026 calendar for Northbridge State University", { universityId: uniIds.NSU });
  await audit(-100, A, "FUND_ALLOCATION_CREATED", "FundAllocation", "Created 2025/2026 Programme Fund of NGN 12,000,000");
  await audit(-96, A, "BATCH_CREATED", "PaymentBatch", `Created batch for Northbridge State University (4 beneficiaries)`, { universityId: uniIds.NSU, paymentBatchId: approved.id });
  await audit(-96, F, "BATCH_APPROVED", "PaymentBatch", "Approved batch SDOS-SIM-2025-0002 (NGN 600,000)", { universityId: uniIds.NSU, paymentBatchId: approved.id });
  await audit(-59, A, "CALENDAR_APPROVED", "AcademicCalendar", "Approved 2025/2026 calendar for Riverside Federal University", { universityId: uniIds.RFU });
  await audit(-61, F, "BATCH_APPROVED", "PaymentBatch", "Approved batch SDOS-SIM-2025-0001 (NGN 450,000)", { universityId: uniIds.RFU, paymentBatchId: paid.id });
  await audit(-59, F, "DISBURSEMENT_SIMULATED", "PaymentBatch", "Simulated disbursement complete for 3 beneficiaries", { universityId: uniIds.RFU, paymentBatchId: paid.id });
  await audit(-49, A, "CALENDAR_APPROVED", "AcademicCalendar", "Approved 2025/2026 calendar for Delta Plains University", { universityId: uniIds.DPU });
  await audit(-38, A, "BATCH_CREATED", "PaymentBatch", "Created batch for Delta Plains University (5 beneficiaries); submitted for finance approval", { universityId: uniIds.DPU, paymentBatchId: pending.id });
  await audit(-25, A, "CALENDAR_APPROVED", "AcademicCalendar", "Approved 2025/2026 calendar for Coastal University of Technology", { universityId: uniIds.CUT });
  await audit(-12, A, "CALENDAR_UPLOADED", "AcademicCalendar", "Uploaded hsu-calendar-draft.csv (3 events, low confidence); awaiting review", { universityId: uniIds.HSU });
  await audit(-7, A, "EXCEPTION_RAISED", "Beneficiary", "Duplicate scholarship declared; beneficiary excluded from batching", { universityId: uniIds.CUT, beneficiaryId: ben.CUT[4].id });
  await audit(-3, A, "BATCH_CREATED", "PaymentBatch", "Created draft batch for Coastal University of Technology (4 beneficiaries)", { universityId: uniIds.CUT, paymentBatchId: draft.id });
}
