import { describe, expect, it } from "vitest";
import { paginate, pageHref, parsePage } from "@/lib/pagination";

describe("paginate", () => {
  it("computes skip/take and totals", () => {
    expect(paginate(95, 2, 20)).toMatchObject({ page: 2, pageSize: 20, totalPages: 5, skip: 20, take: 20, from: 21, to: 40, total: 95 });
  });
  it("shows a short final page correctly", () => {
    expect(paginate(95, 5, 20)).toMatchObject({ skip: 80, from: 81, to: 95 });
  });
  it("clamps out-of-range pages", () => {
    expect(paginate(95, 99, 20).page).toBe(5);
    expect(paginate(95, 0, 20).page).toBe(1);
    expect(paginate(95, -3, 20).page).toBe(1);
  });
  it("handles an empty result set", () => {
    expect(paginate(0, 1, 20)).toMatchObject({ page: 1, totalPages: 1, skip: 0, from: 0, to: 0, total: 0 });
  });
});

describe("parsePage", () => {
  it("parses positive integers and falls back to 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("2.7")).toBe(2);
  });
});

describe("pageHref", () => {
  it("preserves existing filters, replaces page and drops empty values", () => {
    expect(pageHref("/beneficiaries", { q: "ada", status: "", page: "2" }, 4)).toBe("/beneficiaries?q=ada&page=4");
  });
  it("omits the page parameter for page 1", () => {
    expect(pageHref("/beneficiaries", { q: "ada", page: "3" }, 1)).toBe("/beneficiaries?q=ada");
    expect(pageHref("/audit", {}, 1)).toBe("/audit");
  });
  it("drops transient parameters such as the selected drawer", () => {
    expect(pageHref("/beneficiaries", { selected: "x", q: "a" }, 2)).toBe("/beneficiaries?q=a&page=2");
  });
});
