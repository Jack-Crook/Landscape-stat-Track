import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { Camera, Receipt as ReceiptIcon } from "lucide-react";
import { db } from "@/db";
import { files, jobs, receiptItems, receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatCents, formatDate } from "@/lib/format";
import { toCents } from "@/lib/money";
import { resolvePeriod } from "@/lib/periods";
import { EmptyState, LinkButton, Notice, Page, PageHeader, Pill, Row, Section, Segmented, StatTile } from "@/components/kit/ui";

export const metadata = { title: "Receipts" };

const PERIODS = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "fy", label: "This FY" },
  { value: "last-fy", label: "Last FY" },
  { value: "all", label: "All" },
];

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ period?: string; q?: string; saved?: string; view?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const periodKey = PERIODS.some((p) => p.value === sp.period) ? sp.period! : "fy";
  const range = periodKey === "all" ? null : resolvePeriod(periodKey, new Date());
  const q = sp.q?.trim();

  const conds: SQL[] = [eq(receipts.orgId, org.id), eq(receipts.status, "confirmed")];
  if (range) conds.push(gte(receipts.date, range.start), lt(receipts.date, range.end));
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(receipts.vendor, like),
        ilike(receipts.notes, like),
        ilike(receipts.receiptNumber, like),
        sql`exists (select 1 from ${receiptItems} where ${receiptItems.receiptId} = ${receipts.id} and (${receiptItems.itemName} ilike ${like} or ${receiptItems.description} ilike ${like}))`
      )!
    );
  }

  const [toReview, rows] = await Promise.all([
    db
      .select({ r: receipts, jobName: jobs.name, mime: files.mimeType })
      .from(receipts)
      .leftJoin(jobs, eq(jobs.id, receipts.jobId))
      .leftJoin(files, eq(files.id, receipts.fileId))
      .where(and(eq(receipts.orgId, org.id), eq(receipts.status, "needs_review")))
      .orderBy(receipts.createdAt),
    db
      .select({
        r: receipts,
        jobName: jobs.name,
        mime: files.mimeType,
        itemCount: sql<number>`(select count(*)::int from ${receiptItems} where ${receiptItems.receiptId} = ${receipts.id})`,
      })
      .from(receipts)
      .leftJoin(jobs, eq(jobs.id, receipts.jobId))
      .leftJoin(files, eq(files.id, receipts.fileId))
      .where(and(...conds))
      .orderBy(desc(receipts.date), desc(receipts.createdAt))
      .limit(500),
  ]);

  const total = rows.reduce((s, { r }) => s + toCents(r.total), 0);
  const gst = rows.reduce((s, { r }) => s + toCents(r.gstAmount), 0);
  const href = (p: string) => `/receipts?period=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <Page>
      <PageHeader
        title="Receipts"
        actions={
          <>
            <LinkButton href="/receipts/new" variant="gray">
              Add by hand
            </LinkButton>
            <LinkButton href="/receipts/scan">
              <Camera className="h-4 w-4" /> Scan
            </LinkButton>
          </>
        }
      />

      {sp.saved && <Notice tone="good" title="Receipt saved" />}

      {toReview.length > 0 && (
        <Section title={`To review (${toReview.length})`} flush footer="Scanned receipts don't count in your figures until you confirm them.">
          {toReview.map(({ r, jobName, mime }) => (
            <Row
              key={r.id}
              href={`/receipts/${r.id}`}
              leading={r.fileId ? <Thumb id={r.fileId} mime={mime} /> : undefined}
              title={r.vendor}
              subtitle={[formatDate(r.date), jobName, r.scanWarnings?.length ? `${r.scanWarnings.length} to check` : null].filter(Boolean).join(" · ")}
              detail={<span className="font-semibold text-label">{formatCents(toCents(r.total))}</span>}
              trailing={<Pill tone="orange">Review</Pill>}
            />
          ))}
        </Section>
      )}

      <div className="mb-4 space-y-3">
        <Segmented label="Period" value={periodKey} options={PERIODS.map((p) => ({ ...p, href: href(p.value) }))} />
        <form role="search">
          <input type="hidden" name="period" value={periodKey} />
          <input name="q" defaultValue={q} placeholder="Search suppliers or items, e.g. shovel" className="field" aria-label="Search receipts" />
        </form>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Spent" value={formatCents(total)} hint={range?.label ?? "All time"} />
        <StatTile label={org.gstRegistered ? "GST credits" : "GST paid"} value={formatCents(gst)} hint={org.gstRegistered ? "Claim on your BAS" : "Not claimable"} />
        <StatTile label="Receipts" value={String(rows.length)} hint={`${rows.filter((r) => !r.r.jobId).length} general`} />
      </div>

      {rows.length === 0 ? (
        <Section>
          <EmptyState
            icon={<ReceiptIcon />}
            title={q ? "Nothing matches" : "No receipts in this period"}
            body="Scan receipts as you get them: Claude reads every line so you can track exactly what you spend."
            action={
              <LinkButton href="/receipts/scan">
                <Camera className="h-4 w-4" /> Scan a receipt
              </LinkButton>
            }
          />
        </Section>
      ) : (
        <Section flush>
          {rows.map(({ r, jobName, itemCount, mime }) => (
            <Row
              key={r.id}
              href={`/receipts/${r.id}`}
              leading={r.fileId ? <Thumb id={r.fileId} mime={mime} /> : undefined}
              title={r.vendor}
              subtitle={[formatDate(r.date), EXPENSE_CATEGORY_LABELS[r.category ?? ""] ?? null, jobName, itemCount ? `${itemCount} items` : null]
                .filter(Boolean)
                .join(" · ")}
              detail={
                <div>
                  <div className="font-semibold text-label">{formatCents(toCents(r.total))}</div>
                  {toCents(r.gstAmount) > 0 && <div className="footnote">GST {formatCents(toCents(r.gstAmount))}</div>}
                </div>
              }
            />
          ))}
        </Section>
      )}
    </Page>
  );
}

function Thumb({ id, mime }: { id: string; mime: string | null }) {
  if (!mime?.startsWith("image/")) {
    return <span className="caption flex h-10 w-10 items-center justify-center rounded-lg bg-fill font-semibold text-label-2">PDF</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/files/${id}`} alt="" loading="lazy" className="h-10 w-10 rounded-lg bg-fill object-cover" />
  );
}
