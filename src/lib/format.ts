/** Shared display formatters. Server-safe (no client-only APIs). */

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Formats a numeric/string amount as AUD. `null`/`undefined` → em dash. */
export function formatMoney(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return AUD.format(Number(value));
}

/** Formats a Date as e.g. "03 Jun 2026". `null`/`undefined` → em dash. */
export function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return DATE.format(value);
}
