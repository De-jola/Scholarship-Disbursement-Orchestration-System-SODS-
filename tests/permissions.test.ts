import { describe, expect, it } from "vitest";
import { can, parseRole, ROLE_LABEL } from "@/lib/permissions";

describe("permissions", () => {
  it("parses only known roles", () => {
    expect(parseRole("ADMIN")).toBe("ADMIN");
    expect(parseRole("FINANCE_APPROVER")).toBe("FINANCE_APPROVER");
    expect(parseRole("ROOT")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });

  it("only finance approvers may approve batches or simulate disbursement", () => {
    expect(can("FINANCE_APPROVER", "batch.approve")).toBe(true);
    expect(can("FINANCE_APPROVER", "batch.disburse")).toBe(true);
    expect(can("ADMIN", "batch.approve")).toBe(false);
    expect(can("ADMIN", "batch.disburse")).toBe(false);
  });

  it("only administrators manage calendars, verification and batch drafts", () => {
    for (const a of ["calendar.manage", "verification.review", "batch.create", "exception.resolve", "payment.retry"] as const) {
      expect(can("ADMIN", a)).toBe(true);
      expect(can("FINANCE_APPROVER", a)).toBe(false);
    }
  });

  it("labels roles in business English", () => {
    expect(ROLE_LABEL.ADMIN).toBe("Scholarship Administrator");
    expect(ROLE_LABEL.FINANCE_APPROVER).toBe("Finance Approver");
  });
});
