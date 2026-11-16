"use client";

export function ClockSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  return (
    <select
      id="clock"
      name="clock"
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
