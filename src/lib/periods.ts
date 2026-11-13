/**
 * Reporting periods. All ranges are half-open [start, end) in server-local time.
 * The Australian financial year runs 1 July → 30 June and is named by its start
 * year here (FY 2026 = 1 Jul 2026 – 30 Jun 2027, shown as "FY26–27").
 */

export type Range = { start: Date; end: Date; label: string };

/** Parses "YYYY-MM-DD" to local noon, so a date never slips a day across time zones. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "YYYY-MM-DD" in local time (for <input type="date"> values). */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

export function fyStartYear(d: Date): number {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(startYear: number): string {
  return `FY${String(startYear).slice(2)}–${String(startYear + 1).slice(2)}`;
}

export function fyRange(startYear: number): Range {
  return {
    start: new Date(startYear, 6, 1),
    end: new Date(startYear + 1, 6, 1),
    label: fyLabel(startYear),
  };
}

export function monthRange(year: number, month: number): Range {
  const start = new Date(year, month, 1);
  return {
    start,
    end: new Date(year, month + 1, 1),
    label: start.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
  };
}

/** Week starting Monday. */
export function weekRange(d: Date): Range {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (start.getDay() + 6) % 7; // Mon=0
  start.setDate(start.getDate() - dow);
  const end = addDays(start, 7);
  return { start, end, label: `Week of ${start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` };
}

export type BasPeriod = Range & { key: string; due: Date; quarter?: 1 | 2 | 3 | 4 };

/**
 * BAS quarters for a financial year with the ATO's standard lodgement dates
 * (self-lodgers; tax agents usually get longer). Q2's due date is 28 February.
 */
export function basQuarters(startYear: number): BasPeriod[] {
  const y = startYear;
  return [
    { quarter: 1, key: `${y}-Q1`, start: new Date(y, 6, 1), end: new Date(y, 9, 1), due: new Date(y, 9, 28), label: "Jul – Sep" },
    { quarter: 2, key: `${y}-Q2`, start: new Date(y, 9, 1), end: new Date(y + 1, 0, 1), due: new Date(y + 1, 1, 28), label: "Oct – Dec" },
    { quarter: 3, key: `${y}-Q3`, start: new Date(y + 1, 0, 1), end: new Date(y + 1, 3, 1), due: new Date(y + 1, 3, 28), label: "Jan – Mar" },
    { quarter: 4, key: `${y}-Q4`, start: new Date(y + 1, 3, 1), end: new Date(y + 1, 6, 1), due: new Date(y + 1, 6, 28), label: "Apr – Jun" },
  ];
}

/** Monthly BAS periods for a FY: due the 21st of the following month. */
export function basMonths(startYear: number): BasPeriod[] {
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(startYear, 6 + i, 1);
    const end = new Date(startYear, 7 + i, 1);
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      start,
      end,
      due: new Date(end.getFullYear(), end.getMonth(), 21),
      label: start.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
    };
  });
}

export function currentBasPeriod(d: Date, frequency: string): BasPeriod {
  const fy = fyStartYear(d);
  const periods = frequency === "monthly" ? basMonths(fy) : basQuarters(fy);
  return periods.find((p) => d >= p.start && d < p.end) ?? periods[0];
}

/** The last `count` calendar months ending with the month containing `d`, oldest first. */
export function lastMonths(d: Date, count: number): Range[] {
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    const m = new Date(d.getFullYear(), d.getMonth() - offset, 1);
    const r = monthRange(m.getFullYear(), m.getMonth());
    return { ...r, label: m.toLocaleDateString("en-AU", { month: "short" }) };
  });
}

export function inRange(d: Date | null | undefined, r: { start: Date; end: Date }): boolean {
  return !!d && d >= r.start && d < r.end;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export type PeriodKey = "week" | "month" | "quarter" | "fy" | "last-fy" | "custom";

/** Resolves the period picker's URL params to a concrete range. */
export function resolvePeriod(
  key: string | undefined,
  now: Date,
  custom?: { from?: string; to?: string }
): Range & { key: PeriodKey } {
  switch (key) {
    case "week":
      return { ...weekRange(now), key: "week", label: "This week" };
    case "month":
      return { ...monthRange(now.getFullYear(), now.getMonth()), key: "month", label: "This month" };
    case "quarter": {
      const q = currentBasPeriod(now, "quarterly");
      return { ...q, key: "quarter", label: `This quarter (${q.label})` };
    }
    case "last-fy": {
      const r = fyRange(fyStartYear(now) - 1);
      return { ...r, key: "last-fy", label: `Last financial year (${r.label})` };
    }
    case "custom": {
      const from = parseDateOnly(custom?.from);
      const to = parseDateOnly(custom?.to);
      if (from && to && from <= to) {
        const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        const end = addDays(new Date(to.getFullYear(), to.getMonth(), to.getDate()), 1);
        return { start, end, key: "custom", label: `${fmt(start)} – ${fmt(addDays(end, -1))}` };
      }
      break;
    }
  }
  const r = fyRange(fyStartYear(now));
  return { ...r, key: "fy", label: `This financial year (${r.label})` };
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
