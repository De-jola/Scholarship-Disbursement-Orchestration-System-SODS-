export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page content">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      <span className="sr-only">Loading data from the demo database…</span>
    </div>
  );
}
