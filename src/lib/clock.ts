import { cookies } from "next/headers";

/** Default simulated "today" for the demo. All readiness logic uses this, never the real clock. */
export const DEFAULT_CLOCK = "2026-01-12";
export const CLOCK_COOKIE = "sdos_clock";

export const CLOCK_PRESETS = [
  { value: "2025-10-01", label: "1 Oct 2025 — October window" },
  { value: "2025-12-02", label: "2 Dec 2025 — December window" },
  { value: "2026-01-12", label: "12 Jan 2026 — January window" },
  { value: "2026-11-02", label: "2 Nov 2026 — 2026/2027 window" },
];

export function parseClock(value: string | undefined | null): Date {
  const v = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : DEFAULT_CLOCK;
  return new Date(`${v}T09:00:00.000Z`);
}

export function getNow(): Date {
  return parseClock(cookies().get(CLOCK_COOKIE)?.value);
}
