import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageHref, type Pagination as PageInfo } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Pages to show: first, last, and a window around the current page, with gaps marked as null. */
function windowed(page: number, total: number): (number | null)[] {
  const keep = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

interface Props {
  info: PageInfo;
  basePath: string;
  /** Current query parameters, preserved when changing page. */
  params: Record<string, string | undefined>;
  noun?: string;
}

/** Link-based pagination: works without JavaScript, is bookmarkable and keyboard accessible. */
export function Pagination({ info, basePath, params, noun = "results" }: Props) {
  const link = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
      <p className="text-sm text-slate-600" aria-live="polite">
        {info.total === 0 ? `No ${noun}` : <>Showing <strong>{info.from}–{info.to}</strong> of <strong>{info.total}</strong> {noun}</>}
      </p>
      {info.totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            {info.page > 1 ? (
              <Link href={pageHref(basePath, params, info.page - 1)} className={cn(link, "border-slate-300 hover:bg-slate-50")} aria-label="Previous page" rel="prev">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(link, "cursor-not-allowed border-slate-200 text-slate-300")} aria-disabled="true"><ChevronLeft className="h-4 w-4" aria-hidden /><span className="sr-only">Previous page</span></span>
            )}
          </li>
          {windowed(info.page, info.totalPages).map((n, i) =>
            n === null ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-slate-400">…</li>
            ) : (
              <li key={n}>
                <Link
                  href={pageHref(basePath, params, n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === info.page ? "page" : undefined}
                  className={cn(link, n === info.page ? "border-navy-900 bg-navy-900 font-semibold text-white" : "border-slate-300 hover:bg-slate-50")}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
          <li>
            {info.page < info.totalPages ? (
              <Link href={pageHref(basePath, params, info.page + 1)} className={cn(link, "border-slate-300 hover:bg-slate-50")} aria-label="Next page" rel="next">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(link, "cursor-not-allowed border-slate-200 text-slate-300")} aria-disabled="true"><ChevronRight className="h-4 w-4" aria-hidden /><span className="sr-only">Next page</span></span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
