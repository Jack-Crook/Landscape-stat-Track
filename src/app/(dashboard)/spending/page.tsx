import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getOrg } from "@/lib/auth";
import { spendingByCategory, spendingByMonth, topItems, topSuppliers } from "@/lib/data/spending";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatCents, formatDate, formatQuantity } from "@/lib/format";
import { toCents } from "@/lib/money";
import { lastMonths } from "@/lib/periods";
import { EmptyState, LinkButton, Page, PageHeader, Row, Section, Segmented, StatTile } from "@/components/kit/ui";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { SPEND_PERIODS, spendRange } from "./period";

export const metadata = { title: "Spending" };

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ period?: string; q?: string; category?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const { key, range, label } = spendRange(sp.period);
  const q = sp.q?.trim() || undefined;
  const category = EXPENSE_CATEGORIES.some((c) => c.key === sp.category) ? sp.category : undefined;
  const now = new Date();
  const months = lastMonths(now, 12);

  const [cats, items, suppliers, monthly] = await Promise.all([
    spendingByCategory(org.id, range),
    topItems(org.id, { range, q, category, limit: 40 }),
    topSuppliers(org.id, range, 8),
    spendingByMonth(org.id, { start: months[0].start, end: months[11].end }),
  ]);

  const total = cats.reduce((s, c) => s + toCents(c.total), 0);
  const gst = cats.reduce((s, c) => s + toCents(c.gst), 0);
  const byMonth = new Map(monthly.map((m) => [m.month, toCents(m.total)]));
  const qs = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { period: key, q, category, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/spending?${u}`;
  };

  if (total === 0 && !q && !category) {
    return (
      <Page>
        <PageHeader title="Spending" />
        <Segmented className="mb-5" label="Period" value={key} options={SPEND_PERIODS.map((p) => ({ ...p, href: qs({ period: p.value }) }))} />
        <Section>
          <EmptyState
            icon={<ShoppingCart />}
            title="No item spending yet"
            body="Scan receipts and every line lands here: how much on shovels, mulch, fuel or trimmer line, where it's cheapest, and how prices change."
            action={<LinkButton href="/receipts/scan">Scan a receipt</LinkButton>}
          />
        </Section>
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader title="Spending" subtitle={`From confirmed receipt lines · ${label}`} />
      <div className="mb-5 space-y-3">
        <Segmented label="Period" value={key} options={SPEND_PERIODS.map((p) => ({ ...p, href: qs({ period: p.value }) }))} />
        <form role="search" className="flex gap-2">
          <input type="hidden" name="period" value={key} />
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" defaultValue={q} placeholder="What did I spend on… shovels? mulch? fuel?" className="field" aria-label="Search items" />
        </form>
        {(q || category) && (
          <p className="footnote text-label-2">
            Showing {category ? EXPENSE_CATEGORY_LABELS[category] : "all categories"}
            {q ? ` matching “${q}”` : ""}.{" "}
            <Link href={qs({ q: undefined, category: undefined })} className="font-medium text-tint-ink">
              Clear
            </Link>
          </p>
        )}
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Spent on items" value={formatCents(total)} hint="Including GST" />
        <StatTile label={org.gstRegistered ? "GST credits inside" : "GST paid"} value={formatCents(gst)} />
        <StatTile label="Biggest category" value={cats[0] ? EXPENSE_CATEGORY_LABELS[cats[0].category] ?? cats[0].category : "—"} hint={cats[0] ? formatCents(toCents(cats[0].total)) : undefined} />
        <StatTile label="Different items" value={String(items.length >= 40 ? "40+" : items.length)} hint={`${cats.reduce((s, c) => s + c.lines, 0)} lines`} />
      </div>

      <Section title="Last 12 months">
        <ColumnChart
          caption="Item spending by month"
          series={[{ key: "spend", name: "Spent", color: "var(--series-2)" }]}
          data={months.map((m) => {
            const k = `${m.start.getFullYear()}-${String(m.start.getMonth() + 1).padStart(2, "0")}`;
            return { label: m.label, values: { spend: byMonth.get(k) ?? 0 } };
          })}
        />
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="By category">
          <BarList
            caption="Spending by category"
            color="var(--series-1)"
            items={cats.map((c) => ({
              key: c.category,
              label: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
              value: toCents(c.total),
              sub: `${c.lines} line${c.lines === 1 ? "" : "s"} · ${total ? ((toCents(c.total) / total) * 100).toFixed(0) : 0}%`,
              href: qs({ category: c.category }),
            }))}
          />
        </Section>
        <Section title="Where you shop" flush>
          {suppliers.map((s) => (
            <Row
              key={s.vendor}
              title={s.vendor}
              subtitle={`${s.receipts} receipt${s.receipts === 1 ? "" : "s"} · last ${formatDate(s.lastVisit)}`}
              detail={<span className="font-semibold text-label">{formatCents(toCents(s.total))}</span>}
              href={`/receipts?period=all&q=${encodeURIComponent(s.vendor)}`}
            />
          ))}
        </Section>
      </div>

      <Section title={q || category ? "Matching items" : "Top items"} flush footer="Tap an item to see every purchase, price changes and where it's cheapest.">
        {items.length === 0 ? (
          <p className="p-4 text-label-2">Nothing matches that search.</p>
        ) : (
          items.map((i) => {
            // Averages only make sense when every purchase used the same unit.
            const avg = i.avgUnitPrice == null || i.units > 1 ? null : Math.round(Number(i.avgUnitPrice) * 100);
            const per = !i.unit || i.unit === "each" ? "each" : `/${i.unit}`;
            return (
              <Row
                key={i.itemName}
                href={`/spending/item?name=${encodeURIComponent(i.itemName)}`}
                title={i.itemName}
                subtitle={[
                  EXPENSE_CATEGORY_LABELS[i.category] ?? i.category,
                  i.units > 1 ? `bought in ${i.units} units` : `${formatQuantity(i.quantity)}${i.unit && i.unit !== "each" ? ` ${i.unit}` : ""} bought`,
                  `${i.purchases} purchase${i.purchases === 1 ? "" : "s"}`,
                  avg != null ? `avg ${formatCents(avg)} ${per}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                detail={<span className="font-semibold text-label">{formatCents(toCents(i.total))}</span>}
              />
            );
          })
        )}
      </Section>
    </Page>
  );
}
