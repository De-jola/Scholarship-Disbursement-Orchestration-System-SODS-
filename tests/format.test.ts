import { describe, expect, it } from "vitest";
import { formatNaira, formatDate, formatPercent, humanize } from "@/lib/format";

describe("format", () => {
  it("formats naira with grouping", () => {
    expect(formatNaira(12000000)).toBe("₦12,000,000");
    expect(formatNaira(0)).toBe("₦0");
  });
  it("formats dates in a stable en-GB style (UTC)", () => {
    expect(formatDate(new Date("2025-10-06T23:30:00Z"))).toBe("06 Oct 2025");
    expect(formatDate(null)).toBe("—");
  });
  it("formats ratios as whole percentages", () => {
    expect(formatPercent(0.926)).toBe("93%");
  });
  it("humanizes enum values", () => {
    expect(humanize("DISBURSEMENT_SIMULATED")).toBe("Disbursement simulated");
  });
});
