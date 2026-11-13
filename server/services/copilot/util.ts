// Shared helpers for Flo's (Ops Copilot) tools.

export const rowsOf = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

export const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const money = (v: any): number => Math.round(num(v) * 100) / 100;

export const pct = (a: number, b: number): number | null =>
  b ? Math.round((a / b) * 10000) / 100 : null;

export const clamp = (n: any, def: number, min: number, max: number): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, Math.trunc(v)));
};

/** Short window label for status lines: "2026-04", "2026-11-08", "2026-11-01→2026-11-07" or "30d". */
export function windowHint(input: any, defDays: number): string {
  if (input?.from) return input?.to && input.to !== input.from ? `${input.from}→${input.to}` : String(input.from);
  if (input?.month) {
    const y = input?.year ?? new Date().getUTCFullYear();
    return `${y}-${String(input.month).padStart(2, "0")}`;
  }
  return `${input?.days ?? defDays}d`;
}

/** "just now", "12 min", "3 h 5 min", "4 days" — for model-facing ages. */
export function humanAge(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60} min ago`;
  return `${Math.round(m / 1440)} days ago`;
}

/** Escape LIKE/ILIKE wildcards so user text matches literally. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const IST_OFFSET_MS = 330 * 60 * 1000;

export interface ReportWindow {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Resolve a reporting window.
 *  - from/to (YYYY-MM-DD): exact IST calendar days, inclusive.
 *  - month (+ optional year, defaulting to the current year): that UTC
 *    calendar month, [1st, next 1st), capped at now — the same bucketing
 *    payroll and the boss reports use.
 *  - otherwise a trailing `days` window ending now.
 * Returns { error } for a month that hasn't started yet or an invalid month,
 * so the model can tell the user instead of reporting an empty/negative window.
 */
export function resolveWindow(
  input: any,
  defDays: number,
  maxDays: number,
): ReportWindow | { error: string } {
  // Exact IST calendar days: from/to as YYYY-MM-DD (to defaults to from).
  if (input?.from) {
    const parse = (v: any): Date | null => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
      if (!m) return null;
      const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      // Reject impossible dates (2026-02-31 would silently roll into March).
      if (utc.getUTCMonth() !== +m[2] - 1 || utc.getUTCDate() !== +m[3]) return null;
      return new Date(utc.getTime() - IST_OFFSET_MS);
    };
    const from = parse(input.from);
    const to = input?.to ? parse(input.to) : from;
    if (!from || !to) return { error: "from/to must be dates like 2026-11-08" };
    if (to < from) return { error: "to is before from" };
    const now = new Date();
    if (from > now) return { error: `${input.from} hasn't started yet` };
    const toEnd = new Date(to.getTime() + 86400000);
    if ((toEnd.getTime() - from.getTime()) / 86400000 > Math.max(maxDays, 366)) {
      return { error: `date range too long (max ${Math.max(maxDays, 366)} days)` };
    }
    const end = toEnd < now ? toEnd : now;
    const fromLabel = String(input.from).trim();
    const toLabel = String(input?.to ?? input.from).trim();
    const label = `${fromLabel === toLabel ? fromLabel : `${fromLabel} to ${toLabel}`} (IST)${end < toEnd ? " (to date)" : ""}`;
    return { start: from, end, label };
  }
  const hasMonth = input?.month !== undefined && input?.month !== null && input?.month !== "";
  if (hasMonth) {
    const now = new Date();
    const m = Number(input.month);
    const y = input?.year !== undefined && input?.year !== null && input?.year !== ""
      ? Number(input.year)
      : now.getUTCFullYear();
    if (!Number.isInteger(m) || m < 1 || m > 12) return { error: `month must be 1-12 (got ${input.month})` };
    if (!Number.isInteger(y) || y < 2015 || y > 2100) return { error: `year looks invalid (got ${input.year})` };
    const start = new Date(Date.UTC(y, m - 1, 1));
    if (start > now) return { error: `${y}-${String(m).padStart(2, "0")} hasn't started yet` };
    const monthEnd = new Date(Date.UTC(y, m, 1));
    const end = monthEnd < now ? monthEnd : now;
    return { start, end, label: `${y}-${String(m).padStart(2, "0")}${end < monthEnd ? " (to date)" : ""}` };
  }
  const days = clamp(input?.days, defDays, 1, maxDays);
  const end = new Date();
  return { start: new Date(end.getTime() - days * 86400000), end, label: `last ${days} days` };
}

export const windowJson = (w: ReportWindow) => ({
  start: w.start.toISOString(),
  end: w.end.toISOString(),
  label: w.label,
});

export const MONTH_PROPS = {
  year: { type: "integer", description: "Year for a calendar month (defaults to the current year)." },
  month: { type: "integer", description: "Month 1-12 for a calendar month." },
  from: { type: "string", description: "Exact IST start date YYYY-MM-DD (for today/yesterday/specific days or ranges). Overrides month/days." },
  to: { type: "string", description: "Exact IST end date YYYY-MM-DD, inclusive (defaults to from)." },
} as const;
