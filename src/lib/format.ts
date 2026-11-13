/** Shared display formatters. Server-safe (no client-only APIs). */

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const AUD_WHOLE = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const AUD_COMPACT = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const DATE_SHORT = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });

/** Formats a numeric/string amount (dollars) as AUD. `null`/`undefined` → em dash. */
export function formatMoney(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return AUD.format(Number(value));
}

/** Cents → "$1,234.50". */
export function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return AUD.format(cents / 100);
}

/** Cents → "$1,235" (no cents, for headline figures). */
export function formatCentsWhole(cents: number | null | undefined) {
  if (cents == null) return "—";
  return AUD_WHOLE.format(Math.round(cents / 100));
}

/** Cents → "$12.9K" style for chart axes and tight tiles. Under $10k stays exact. */
export function formatCentsCompact(cents: number) {
  if (Math.abs(cents) < 1_000_000) return AUD_WHOLE.format(Math.round(cents / 100));
  return AUD_COMPACT.format(cents / 100);
}

/** Formats a Date as e.g. "3 Jun 2026". `null`/`undefined` → em dash. */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return DATE.format(d);
}

export function formatDateShort(value: Date | null | undefined) {
  if (!value) return "—";
  return DATE_SHORT.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatQuantity(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/** "3 days ago" / "in 5 days" relative to now. */
export function formatRelativeDays(d: Date, now = new Date()) {
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
