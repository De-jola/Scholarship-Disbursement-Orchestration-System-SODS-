import { FileText } from "lucide-react";

interface Props {
  universityName: string;
  documentName: string;
  documentType: string;
  values: Record<string, string>;
  unreadable?: boolean;
}

/** A purely visual, simulated rendering of the uploaded document. Not a real file viewer. */
export function DocumentPreview({ universityName, documentName, documentType, values, unreadable }: Props) {
  const title = documentType === "TRANSCRIPT" ? "Academic Transcript" : documentType === "COURSE_REGISTRATION_FORM" ? "Course Registration Form" : "Statement of Result";
  const rows: [string, string][] = [
    ["Name", values.studentName], ["Matric No.", values.matricNumber], ["Department", values.department], ["Level", values.level],
    ["Session", values.academicSession], ["CGPA", values.cgpa], ["Academic Status", values.academicStatus], ["Date of result", values.resultDate],
  ];
  return (
    <figure className="rounded-lg border border-slate-300 bg-slate-100 p-4" aria-label={`Simulated preview of ${documentName}`}>
      <div className={`mx-auto max-w-md rounded bg-white p-6 shadow ${unreadable ? "blur-[3px]" : ""}`}>
        <div className="border-b-2 border-navy-900 pb-3 text-center">
          <FileText className="mx-auto h-6 w-6 text-navy-700" aria-hidden />
          <p className="mt-1 text-sm font-bold uppercase tracking-wide text-navy-900">{values.university || universityName}</p>
          <p className="text-xs uppercase tracking-widest text-slate-500">Office of the Registrar · {title}</p>
        </div>
        <dl className="mt-4 space-y-2 font-mono text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-dashed border-slate-200 pb-1">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-semibold text-slate-900">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-slate-400">Simulated document — synthetic data</p>
      </div>
      <figcaption className="mt-2 text-center text-xs text-slate-500">{documentName} · preview shows the original extracted values</figcaption>
    </figure>
  );
}
