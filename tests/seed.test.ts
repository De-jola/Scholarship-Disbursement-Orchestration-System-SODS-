import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runSeed } from "../prisma/seed-lib";

const root = path.resolve(__dirname, "..");
const dbFile = path.join(root, "prisma", "test-seed.db");
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;

let prisma: PrismaClient;

beforeAll(async () => {
  rmSync(dbFile, { force: true });
  execSync("npx prisma db push --skip-generate", {
    cwd: root,
    env: process.env,
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await runSeed(prisma);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed data", () => {
  it("creates two demo users, one per role", async () => {
    const roles = (await prisma.user.findMany()).map((u) => u.role).sort();
    expect(roles).toEqual(["ADMIN", "FINANCE_APPROVER"]);
  });

  it("imports the university directory (8 active partners) and creates 40-60 beneficiaries", async () => {
    expect(await prisma.university.count()).toBe(312);
    expect(await prisma.university.count({ where: { status: "ACTIVE" } })).toBe(8);
    const n = await prisma.beneficiary.count();
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(60);
  });

  it("covers every verification status", async () => {
    const rows = await prisma.beneficiary.groupBy({ by: ["verificationStatus"] });
    expect(rows.map((r) => r.verificationStatus).sort()).toEqual(
      [
        "AWAITING_RESULT",
        "DOCUMENT_SUBMITTED",
        "EXCEPTION",
        "EXTRACTED",
        "NOT_STARTED",
        "REJECTED",
        "REVIEW_PENDING",
        "VERIFIED",
      ].sort(),
    );
  });

  it("uses only synthetic contact details and masked bank references", async () => {
    const all = await prisma.beneficiary.findMany();
    for (const b of all) {
      expect(b.email.endsWith("@example.test")).toBe(true);
      expect(b.bankAccountMasked).toMatch(/^\*{4}\d{4}$/);
    }
  });

  it("gives universities A, B and C registration windows in Oct, Dec and Jan", async () => {
    const month = async (short: string) => {
      const cal = await prisma.academicCalendar.findFirstOrThrow({
        where: { university: { shortName: short }, reviewStatus: "APPROVED", session: "2025/2026" },
        include: { events: true },
      });
      const reg = cal.events.find((e) => e.eventType === "REGISTRATION")!;
      return reg.startDate.getUTCMonth() + 1;
    };
    expect(await month("ABU")).toBe(10);
    expect(await month("DELSU")).toBe(12);
    expect(await month("RSU")).toBe(1);
  });

  it("has calendar edge cases: missing, pending review, expired", async () => {
    const approved2526 = await prisma.academicCalendar.findMany({
      where: { reviewStatus: "APPROVED", session: "2025/2026" },
      select: { universityId: true },
    });
    expect(approved2526.length).toBeLessThan(8);
    expect(await prisma.academicCalendar.count({ where: { reviewStatus: "PENDING_REVIEW" } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.academicCalendar.count({ where: { session: "2024/2025", reviewStatus: "APPROVED" } })).toBeGreaterThanOrEqual(1);
  });

  it("seeds exactly one duplicate-scholarship exception", async () => {
    const dup = await prisma.beneficiary.findMany({
      where: { otherScholarshipDeclaration: true, exceptionType: "DUPLICATE_SCHOLARSHIP", exceptionResolvedAt: null },
    });
    expect(dup).toHaveLength(1);
    expect(dup[0].verificationStatus).toBe("EXCEPTION");
  });

  it("seeds a low-confidence extraction, a name mismatch and an unreadable document", async () => {
    const low = await prisma.resultSubmission.count({
      where: { extractionConfidence: { lt: 0.8, gt: 0 }, status: "REVIEW_PENDING" },
    });
    expect(low).toBeGreaterThanOrEqual(1);
    const mismatch = await prisma.extractedField.count({
      where: { fieldName: "studentName", warning: { contains: "differs" } },
    });
    expect(mismatch).toBeGreaterThanOrEqual(1);
    const unreadable = await prisma.beneficiary.count({ where: { exceptionType: "UNREADABLE_DOCUMENT" } });
    expect(unreadable).toBe(1);
  });

  it("seeds one approved, one pending and one draft batch for three universities, plus one completed", async () => {
    const batches = await prisma.paymentBatch.findMany();
    expect(batches.map((b) => b.status).sort()).toEqual(["APPROVED", "DISBURSEMENT_SIMULATED", "DRAFT", "PENDING_APPROVAL"]);
    const open = batches.filter((b) => b.status !== "DISBURSEMENT_SIMULATED");
    expect(new Set(open.map((b) => b.universityId)).size).toBe(3);
  });

  it("keeps fund allocation figures internally consistent", async () => {
    const fund = await prisma.fundAllocation.findFirstOrThrow();
    expect(fund.availableAmount).toBeCloseTo(fund.totalAmount - fund.committedAmount - fund.disbursedAmount, 2);
    const approved = await prisma.paymentBatch.findMany({ where: { status: "APPROVED" } });
    const committed = approved.reduce((s, b) => s + b.totalAmount, 0);
    expect(fund.committedAmount).toBeCloseTo(committed, 2);
    const done = await prisma.paymentBatch.findMany({ where: { status: "DISBURSEMENT_SIMULATED" } });
    expect(fund.disbursedAmount).toBeCloseTo(done.reduce((s, b) => s + b.totalAmount, 0), 2);
  });

  it("records batch totals equal to the sum of their items", async () => {
    const batches = await prisma.paymentBatch.findMany({ include: { items: true } });
    for (const b of batches) {
      expect(b.totalAmount).toBeCloseTo(b.items.reduce((s, i) => s + i.amount, 0), 2);
    }
  });
});
