export const DEFAULT_PAGE_SIZE = 20;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  take: number;
  /** 1-based index of the first/last row on this page (0 when empty). */
  from: number;
  to: number;
}

export function paginate(total: number, page: number, pageSize = DEFAULT_PAGE_SIZE): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const skip = (p - 1) * pageSize;
  return {
    page: p, pageSize, total, totalPages, skip, take: pageSize,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(total, skip + pageSize),
  };
}

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Parameters that only make sense for the current view and are dropped when paging. */
const TRANSIENT = new Set(["selected", "page"]);

export function pageHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && !TRANSIENT.has(k)) qs.set(k, v);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}
