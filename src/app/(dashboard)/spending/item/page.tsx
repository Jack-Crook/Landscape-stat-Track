import { notFound } from "next/navigation";
import { getOrg } from "@/lib/auth";
import { itemPurchases } from "@/lib/data/spending";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatCents, formatDate, formatDateShort, formatQuantity } from "@/lib/format";
import { toCents } from "@/lib/money";
import { Notice, Page, PageHeader, Row, Section, Segmented, StatTile } from "@/components/kit/ui";
import { LineChart } from "@/components/charts/charts";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  return { title: name ?? "Item" };
}

const unitKey = (u: string | null) => (u ?? "each").trim().toLowerCase().replace("m³", "m3").replace(/^ea$/, "each");

export default async function ItemPage({ searchParams }: { searchParams: Promise<{ name?: string; unit?: string }> }) {
  const org = await getOrg();
  const { name, unit: unitParam } = await searchParams;
  if (!name) notFound();
  const rows = await itemPurchases(org.id, name);
  if (rows.length === 0) notFound();

  const total = rows.reduce((s, r) => s + toCents(r.total), 0);
  // Unit price paid (incl. GST): printed unit price, else line total ÷ quantity.
  const unit = (r: (typeof rows)[number]) =>
    r.unitPrice != null ? Math.round(Number(r.unitPrice) * 100) : Number(r.quantity) > 0 ? Math.round(toCents(r.total) / Number(r.quantity)) : null;

  // Prices only compare within one unit (a 50 L bag isn't a cubic metre).
  const unitCounts = new Map<string, number>();
  for (const r of rows) unitCounts.set(unitKey(r.unit), (unitCounts.get(unitKey(r.unit)) ?? 0) + 1);
  const units = [...unitCounts].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  const activeUnit = unitParam && units.includes(unitParam) ? unitParam : units[0];
  const sameUnit = rows.filter((r) => unitKey(r.unit) === activeUnit);

  const qty = sameUnit.reduce((s, r) => s + Number(r.quantity), 0);
  const unitTotal = sameUnit.reduce((s, r) => s + toCents(r.total), 0);
  const priced = sameUnit.map((r) => ({ ...r, unitCents: unit(r) })).filter((r) => r.unitCents != null) as Array<(typeof rows)[number] & { unitCents: number }>;
  const avg = qty > 0 ? Math.round(unitTotal / qty) : null;

  // Price over time, oldest first.
  const history = [...priced].reverse();
  const first = history[0]?.unitCents;
  const last = history[history.length - 1]?.unitCents;
  const change = first && last && history.length > 1 ? ((last - first) / first) * 100 : null;

  // Supplier comparison by average unit price.
  const bySupplier = new Map<string, { vendor: string; spent: number; qty: number; prices: number[] }>();
  for (const r of priced) {
    const s = bySupplier.get(r.vendor) ?? { vendor: r.vendor, spent: 0, qty: 0, prices: [] };
    s.spent += toCents(r.total);
    s.qty += Number(r.quantity);
    s.prices.push(r.unitCents);
    bySupplier.set(r.vendor, s);
  }
  const suppliers = [...bySupplier.values()]
    .map((s) => ({ ...s, avg: Math.round(s.prices.reduce((a, b) => a + b, 0) / s.prices.length) }))
    .sort((a, b) => a.avg - b.avg);
  const cheapest = suppliers.length > 1 ? suppliers[0] : null;
  const dearest = suppliers.length > 1 ? suppliers[suppliers.length - 1] : null;
  const potentialSaving = cheapest && dearest ? Math.round((dearest.avg - cheapest.avg) * dearest.qty) : 0;
  const per = activeUnit === "each" ? "each" : `per ${activeUnit}`;

  return (
    <Page>
      <PageHeader
        title={rows[0] ? name : "Item"}
        back={{ href: "/spending", label: "Spending" }}
        subtitle={EXPENSE_CATEGORY_LABELS[rows[0].category] ?? rows[0].category}
      />

      {units.length > 1 && (
        <div className="mb-4">
          <Segmented
            label="Unit"
            value={activeUnit}
            options={units.map((u) => ({ value: u, label: u === "each" ? "Each" : `Per ${u}`, href: `/spending/item?name=${encodeURIComponent(name)}&unit=${encodeURIComponent(u)}` }))}
          />
          <p className="footnote mt-2 text-label-2">Bought in {units.length} different units. Prices are compared within one unit at a time.</p>
        </div>
      )}

      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total spent" value={formatCents(total)} hint="All time, incl. GST" />
        <StatTile label="Bought" value={`${formatQuantity(qty)}${activeUnit === "each" ? "" : ` ${activeUnit}`}`} hint={`${sameUnit.length} purchase${sameUnit.length === 1 ? "" : "s"}`} />
        <StatTile label="Average price" value={avg == null ? "—" : formatCents(avg)} hint={per} />
        <StatTile
          label="Price change"
          value={change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
          tone={change != null && change > 5 ? "bad" : change != null && change < -5 ? "good" : undefined}
          hint={change == null ? "Needs 2+ purchases" : `Since ${formatDate(history[0].date)}`}
        />
      </div>

      {cheapest && dearest && cheapest.vendor !== dearest.vendor && (
        <Notice tone="good" title={`Cheapest at ${cheapest.vendor}`}>
          {formatCents(cheapest.avg)} {per} on average vs {formatCents(dearest.avg)} at {dearest.vendor}.
          {potentialSaving > 0 && ` Buying it all at ${cheapest.vendor} would have saved about ${formatCents(potentialSaving)}.`}
        </Notice>
      )}

      {history.length > 1 && (
        <Section title={`Price paid ${per}`}>
          <LineChart
            caption={`Price of ${name} ${per} over time`}
            series={[{ key: "price", name: "Unit price", color: "var(--series-1)" }]}
            data={history.map((r) => ({ label: formatDateShort(r.date), values: { price: r.unitCents } }))}
          />
        </Section>
      )}

      {suppliers.length > 0 && (
        <Section title="By supplier" flush>
          {suppliers.map((s) => (
            <Row
              key={s.vendor}
              title={s.vendor}
              subtitle={`${formatQuantity(s.qty)} bought · ${formatCents(s.spent)} total`}
              detail={<span className="font-semibold text-label">{formatCents(s.avg)} {per}</span>}
            />
          ))}
        </Section>
      )}

      <Section title="Every purchase" flush>
        {rows.map((r) => (
          <Row
            key={r.id}
            href={`/receipts/${r.receiptId}`}
            title={r.description}
            subtitle={[formatDate(r.date), r.vendor + (r.vendorBranch ? ` ${r.vendorBranch}` : ""), r.brand].filter(Boolean).join(" · ")}
            detail={
              <div>
                <div className="font-semibold text-label">{formatCents(toCents(r.total))}</div>
                <div className="footnote">
                  {formatQuantity(r.quantity)}
                  {r.unit ? ` ${r.unit}` : ""} × {unit(r) == null ? "—" : formatCents(unit(r)!)}
                </div>
              </div>
            }
          />
        ))}
      </Section>
    </Page>
  );
}
