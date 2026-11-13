import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, jobs, quotes } from "@/db/schema";
import { median } from "@/lib/finance";
import { toCents } from "@/lib/money";
import { daysBetween } from "@/lib/periods";
import type { Ledger } from "./ledger";

type JobRow = typeof jobs.$inferSelect;

function revenueOf(job: JobRow, gstRegistered: boolean) {
  const price = toCents(job.quotedPrice);
  return gstRegistered ? price - Math.round(price / 11) : price;
}

/** Jobs that are done enough to judge (completed, invoiced or paid) and have a price. */
function finishedJobs(rows: JobRow[]) {
  return rows.filter((j) => ["completed", "invoiced", "paid"].includes(j.status) && j.quotedPrice != null && j.profit != null);
}

/** Median margin % per job category, for the quote pricing helper. */
export async function categoryMargins(orgId: string, gstRegistered: boolean): Promise<Record<string, number>> {
  const rows = finishedJobs(await db.select().from(jobs).where(eq(jobs.orgId, orgId)));
  const by = new Map<string, number[]>();
  for (const j of rows) {
    const rev = revenueOf(j, gstRegistered);
    if (!j.category || rev <= 0) continue;
    by.set(j.category, [...(by.get(j.category) ?? []), (toCents(j.profit) / rev) * 100]);
  }
  return Object.fromEntries([...by].map(([k, v]) => [k, median(v)!]));
}

export type CategoryInsight = {
  category: string;
  jobs: number;
  revenue: number;
  profit: number;
  margin: number | null;
  profitPerHour: number | null;
  quotesSent: number;
  quotesWon: number;
  winRate: number | null;
  overBudget: number;
};

export async function loadInsights(orgId: string, gstRegistered: boolean, ledger: Ledger) {
  const [jobRows, quoteRows, clientRows] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.orgId, orgId)),
    db.select().from(quotes).where(eq(quotes.orgId, orgId)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.orgId, orgId)),
  ]);

  // ── By category ──
  const cats = new Map<string, CategoryInsight & { hours: number; profitWithHours: number }>();
  const cat = (name: string | null) => {
    const key = name || "Uncategorised";
    if (!cats.has(key)) {
      cats.set(key, { category: key, jobs: 0, revenue: 0, profit: 0, margin: null, profitPerHour: null, quotesSent: 0, quotesWon: 0, winRate: null, overBudget: 0, hours: 0, profitWithHours: 0 });
    }
    return cats.get(key)!;
  };
  const finished = finishedJobs(jobRows);
  for (const j of finished) {
    const c = cat(j.category);
    c.jobs++;
    c.revenue += revenueOf(j, gstRegistered);
    c.profit += toCents(j.profit);
    const hours = Number(j.hoursWorked ?? 0);
    if (hours > 0) {
      c.hours += hours;
      c.profitWithHours += toCents(j.profit);
    }
    if (j.estimatedCost != null && toCents(j.actualCost) > toCents(j.estimatedCost) * 1.1) c.overBudget++;
  }
  const decidedStatuses = ["accepted", "declined", "no_response"];
  for (const q of quoteRows) {
    if (!decidedStatuses.includes(q.status)) continue;
    const c = cat(q.category);
    c.quotesSent++;
    if (q.status === "accepted") c.quotesWon++;
  }
  const byCategory = [...cats.values()]
    .map((c) => ({
      ...c,
      margin: c.revenue > 0 ? (c.profit / c.revenue) * 100 : null,
      profitPerHour: c.hours > 0 ? Math.round(c.profitWithHours / c.hours) : null,
      winRate: c.quotesSent > 0 ? (c.quotesWon / c.quotesSent) * 100 : null,
    }))
    .sort((a, b) => b.profit - a.profit);

  // ── Quotes overall ──
  const decided = quoteRows.filter((q) => decidedStatuses.includes(q.status));
  const won = decided.filter((q) => q.status === "accepted");
  const responseDays = decided.filter((q) => q.sentAt && q.respondedAt).map((q) => daysBetween(q.sentAt!, q.respondedAt!));
  const now = new Date();
  const awaiting = quoteRows.filter((q) => q.status === "sent");
  const stale = awaiting.filter((q) => q.sentAt && daysBetween(q.sentAt, now) >= 7);

  // Win rate by price band (ex-GST subtotal)
  const bands = [
    { label: "Under $500", max: 50_000 },
    { label: "$500–$2k", max: 200_000 },
    { label: "$2k–$5k", max: 500_000 },
    { label: "$5k–$15k", max: 1_500_000 },
    { label: "$15k+", max: Infinity },
  ].map((b) => ({ ...b, sent: 0, won: 0 }));
  for (const q of decided) {
    const sub = toCents(q.subtotal);
    const b = bands.find((x) => sub < x.max)!;
    b.sent++;
    if (q.status === "accepted") b.won++;
  }

  // ── Cost blowouts ──
  const blowouts = finished
    .filter((j) => j.estimatedCost != null && toCents(j.estimatedCost) > 0)
    .map((j) => ({
      id: j.id,
      name: j.name,
      estimated: toCents(j.estimatedCost),
      actual: toCents(j.actualCost),
      variance: toCents(j.actualCost) - toCents(j.estimatedCost),
    }))
    .filter((j) => j.variance > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 8);
  const withEstimates = finished.filter((j) => j.estimatedCost != null && toCents(j.estimatedCost) > 0);
  const avgVariancePct =
    withEstimates.length > 0
      ? (withEstimates.reduce((s, j) => s + (toCents(j.actualCost) - toCents(j.estimatedCost)) / toCents(j.estimatedCost), 0) / withEstimates.length) * 100
      : null;

  // ── Clients: lifetime value and payment speed ──
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const cv = new Map<string, { id: string; name: string; paid: number; owing: number; overdue: number; days: number[]; invoices: number }>();
  for (const inv of ledger.invoices) {
    if (!inv.clientId || inv.status === "void" || inv.status === "draft") continue;
    const c = cv.get(inv.clientId) ?? { id: inv.clientId, name: clientName.get(inv.clientId) ?? "Client", paid: 0, owing: 0, overdue: 0, days: [], invoices: 0 };
    c.invoices++;
    if (inv.status === "paid") {
      c.paid += toCents(inv.total);
      if (inv.paidAt) c.days.push(daysBetween(inv.issueDate, inv.paidAt));
    } else {
      c.owing += toCents(inv.total);
      if (inv.dueDate && inv.dueDate < now) c.overdue += toCents(inv.total);
    }
    cv.set(inv.clientId, c);
  }
  const clientsOut = [...cv.values()]
    .map((c) => ({ ...c, medianDays: median(c.days) }))
    .sort((a, b) => b.paid - a.paid);
  const slowPayers = clientsOut.filter((c) => (c.medianDays ?? 0) > 21 || c.overdue > 0).sort((a, b) => (b.medianDays ?? 0) - (a.medianDays ?? 0));

  // ── Seasonality: income by calendar month across all years ──
  const season = Array.from({ length: 12 }, (_, m) => ({ month: m, total: 0, years: new Set<number>() }));
  for (const inv of ledger.invoices) {
    if (inv.status !== "paid") continue;
    const d = inv.paidAt ?? inv.issueDate;
    season[d.getMonth()].total += toCents(inv.total) - (gstRegistered ? toCents(inv.gstAmount) : 0);
    season[d.getMonth()].years.add(d.getFullYear());
  }
  const seasonality = season.map((s) => ({
    month: s.month,
    label: new Date(2000, s.month, 1).toLocaleDateString("en-AU", { month: "short" }),
    average: s.years.size ? Math.round(s.total / s.years.size) : 0,
  }));

  // ── Overall per-hour ──
  const hoursJobs = finished.filter((j) => Number(j.hoursWorked ?? 0) > 0);
  const totalHours = hoursJobs.reduce((s, j) => s + Number(j.hoursWorked), 0);
  const profitPerHour = totalHours > 0 ? Math.round(hoursJobs.reduce((s, j) => s + toCents(j.profit), 0) / totalHours) : null;

  return {
    byCategory,
    quotes: {
      decided: decided.length,
      won: won.length,
      winRate: decided.length ? (won.length / decided.length) * 100 : null,
      medianResponseDays: median(responseDays),
      awaiting: awaiting.length,
      stale: stale.map((q) => ({ id: q.id, title: q.title, number: q.number, sentAt: q.sentAt!, total: toCents(q.total) })),
      bands: bands.map((b) => ({ label: b.label, sent: b.sent, won: b.won, rate: b.sent ? (b.won / b.sent) * 100 : null })),
    },
    blowouts,
    avgVariancePct,
    clients: clientsOut,
    slowPayers,
    seasonality,
    profitPerHour,
    totalHours,
    finishedJobs: finished.length,
  };
}
