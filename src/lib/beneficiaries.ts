import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, paginate } from "@/lib/pagination";
import { selectEffectiveCalendar } from "@/lib/effective-calendar";

export interface BeneficiaryFilters {
  universityId?: string;
  status?: string;
  session?: string;
  exceptionType?: string;
  q?: string;
  /** Restrict to these beneficiary ids (used for readiness filtering). */
  ids?: string[];
}

function buildWhere(f: BeneficiaryFilters): Prisma.BeneficiaryWhereInput {
  const where: Prisma.BeneficiaryWhereInput = {};
  if (f.ids) where.id = { in: f.ids };
  if (f.universityId) where.universityId = f.universityId;
  if (f.status) where.verificationStatus = f.status as never;
  if (f.session) where.academicSession = f.session;
  if (f.exceptionType) where.exceptionType = f.exceptionType as never;
  if (f.q?.trim()) {
    const q = f.q.trim();
    // SQLite LIKE is case-insensitive for ASCII, which is sufficient for these synthetic records.
    where.OR = [
      { fullName: { contains: q } },
      { matricNumber: { contains: q } },
      { applicationRef: { contains: q } },
    ];
  }
  return where;
}

function toRow(b: Prisma.BeneficiaryGetPayload<{ include: { university: true } }>) {
  return {
    id: b.id,
    applicationRef: b.applicationRef,
    fullName: b.fullName,
    universityId: b.universityId,
    universityShortName: b.university.shortName,
    universityName: b.university.name,
    department: b.department,
    level: b.level,
    academicSession: b.academicSession,
    matricNumber: b.matricNumber,
    verificationStatus: b.verificationStatus,
    exceptionType: b.exceptionType,
    exceptionResolvedAt: b.exceptionResolvedAt,
    otherScholarshipDeclaration: b.otherScholarshipDeclaration,
    lastActivityAt: b.lastActivityAt,
  };
}

export async function listBeneficiaries(f: BeneficiaryFilters) {
  const rows = await db.beneficiary.findMany({ where: buildWhere(f), include: { university: true }, orderBy: { lastActivityAt: "desc" } });
  return rows.map(toRow);
}

export async function listBeneficiariesPage(f: BeneficiaryFilters, page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const where = buildWhere(f);
  const pagination = paginate(await db.beneficiary.count({ where }), page, pageSize);
  const rows = await db.beneficiary.findMany({
    where, include: { university: true }, orderBy: [{ lastActivityAt: "desc" }, { id: "asc" }], skip: pagination.skip, take: pagination.take,
  });
  return { rows: rows.map(toRow), pagination };
}

export type BeneficiaryListRow = Awaited<ReturnType<typeof listBeneficiaries>>[number];

export async function getBeneficiaryDetail(id: string, now: Date = new Date()) {
  const b = await db.beneficiary.findUnique({
    where: { id },
    include: {
      university: { include: { calendars: { include: { events: true }, orderBy: { createdAt: "desc" } } } },
      events: { orderBy: { createdAt: "desc" } },
      submissions: { include: { fields: true }, orderBy: { createdAt: "desc" } },
      batchItems: { include: { batch: true }, orderBy: { id: "asc" } },
    },
  });
  if (!b) return null;

  const eff = selectEffectiveCalendar(b.university.calendars, now);
  const cal = eff.calendar;
  const registration = cal?.events.find((e) => e.eventType === "REGISTRATION");

  return {
    id: b.id,
    applicationRef: b.applicationRef,
    fullName: b.fullName,
    email: b.email,
    phone: b.phone,
    universityId: b.universityId,
    universityName: b.university.name,
    department: b.department,
    level: b.level,
    academicSession: b.academicSession,
    matricNumber: b.matricNumber,
    scholarshipStatus: b.scholarshipStatus,
    verificationStatus: b.verificationStatus,
    otherScholarshipDeclaration: b.otherScholarshipDeclaration,
    exceptionType: b.exceptionType,
    exceptionNote: b.exceptionNote,
    exceptionResolvedAt: b.exceptionResolvedAt,
    bankAccountMasked: b.bankAccountMasked,
    hasBankToken: !!b.bankAccountToken,
    calendar: cal
      ? {
          id: cal.id, session: cal.session, reviewStatus: cal.reviewStatus, expired: eff.status === "EXPIRED",
          registrationStart: registration?.startDate ?? null, registrationEnd: registration?.endDate ?? null,
        }
      : null,
    timeline: b.events.map((e) => ({ id: e.id, eventType: e.eventType, actorName: e.actorName, actorType: e.actorType, details: e.details, createdAt: e.createdAt })),
    submissions: b.submissions.map((s) => ({
      id: s.id, documentName: s.documentName, documentType: s.documentType, status: s.status,
      extractionConfidence: s.extractionConfidence, reviewerNotes: s.reviewerNotes, createdAt: s.createdAt,
      fields: s.fields.map((f) => ({
        id: f.id, fieldName: f.fieldName, extractedValue: f.extractedValue, confidence: f.confidence, warning: f.warning,
        reviewerCorrectedValue: f.reviewerCorrectedValue, status: f.status,
      })),
    })),
    payments: b.batchItems.map((i) => ({
      id: i.id, batchId: i.paymentBatchId, batchName: i.batch.batchName, amount: i.amount, status: i.status,
      paidAt: i.paidAt, failureReason: i.failureReason, paymentReference: i.batch.paymentReference,
    })),
  };
}

export type BeneficiaryDetail = NonNullable<Awaited<ReturnType<typeof getBeneficiaryDetail>>>;
