import { FileText } from "lucide-react";

/** Shows the text actually read from the uploaded file, so the reviewer can compare it with the extracted fields. */
export function DocumentText({ documentName, text }: { documentName: string; text: string }) {
  return (
    <figure className="rounded-lg border border-slate-300 bg-slate-100 p-4" aria-label={`Text read from ${documentName}`}>
      <div className="rounded bg-white p-5 shadow">
        <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <FileText className="h-4 w-4 text-navy-600" aria-hidden />Text read from the uploaded document
        </div>
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-900">{text}</pre>
      </div>
      <figcaption className="mt-2 text-center text-xs text-slate-500">{documentName} · read locally from the file; nothing was sent to an external service</figcaption>
    </figure>
  );
}
