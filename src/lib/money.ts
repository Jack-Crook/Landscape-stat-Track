/**
 * Money helpers. All arithmetic happens in integer cents so sums never drift
 * (0.1 + 0.2 problems). The DB stores numeric(…, 2) strings; convert at the edge.
 */

export type Cents = number;

/** "12.34" | 12.34 | null → 1234. Empty/invalid → 0. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 1234 → "12.34" (the string shape numeric columns expect). */
export function fromCents(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function sumCents(values: Array<string | number | null | undefined>): Cents {
  return values.reduce<Cents>((acc, v) => acc + toCents(v), 0);
}

/** Percentage (0–100) of part over whole, or null when whole is 0. */
export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}

/** Parses a user-typed amount ("$1,234.50", "1234.5") into cents; null if invalid. */
export function parseAmountInput(raw: unknown): Cents | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*(\.\d{0,4})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
