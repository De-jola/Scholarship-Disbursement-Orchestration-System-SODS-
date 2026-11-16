export type Role = "ADMIN" | "FINANCE_APPROVER";

export type Action =
  | "calendar.manage"
  | "verification.review"
  | "exception.resolve"
  | "batch.create"
  | "batch.approve"
  | "batch.disburse"
  | "payment.retry"
  | "fund.adjust";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Scholarship Administrator",
  FINANCE_APPROVER: "Finance Approver",
};

const MATRIX: Record<Action, Role[]> = {
  "calendar.manage": ["ADMIN"],
  "verification.review": ["ADMIN"],
  "exception.resolve": ["ADMIN"],
  "batch.create": ["ADMIN"],
  "batch.approve": ["FINANCE_APPROVER"],
  "batch.disburse": ["FINANCE_APPROVER"],
  "payment.retry": ["ADMIN"],
  "fund.adjust": ["FINANCE_APPROVER", "ADMIN"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

export function parseRole(value: string | undefined | null): Role | null {
  return value === "ADMIN" || value === "FINANCE_APPROVER" ? value : null;
}
