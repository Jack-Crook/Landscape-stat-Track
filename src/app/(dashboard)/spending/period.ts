import { lastMonths, resolvePeriod } from "@/lib/periods";

export const SPEND_PERIODS = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "Quarter" },
  { value: "fy", label: "This FY" },
  { value: "last-fy", label: "Last FY" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

export function spendRange(key: string | undefined, now = new Date()) {
  const k = SPEND_PERIODS.some((p) => p.value === key) ? key! : "fy";
  if (k === "all") return { key: k, range: undefined, label: "All time" };
  if (k === "12m") {
    const m = lastMonths(now, 12);
    return { key: k, range: { start: m[0].start, end: m[11].end }, label: "Last 12 months" };
  }
  const r = resolvePeriod(k, now);
  return { key: k, range: { start: r.start, end: r.end }, label: r.label };
}
