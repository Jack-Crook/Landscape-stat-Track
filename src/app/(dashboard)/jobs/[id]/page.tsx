import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Check, MapPin, Repeat, Trash2 } from "lucide-react";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { getJobDetail } from "@/lib/data/jobs";
import { clientOptions, jobCategoryOptions } from "@/lib/data/lookups";
import { jobFinancials } from "@/lib/finance";
import { toCents } from "@/lib/money";
import { toDateInput } from "@/lib/periods";
import {
  COST_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  JOB_STATUSES,
  RECURRENCE_LABELS,
} from "@/lib/constants";
import { formatCents, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KeyValue, LinkButton, Money, Page, PageHeader, Pill, Row, Section } from "@/components/kit/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/kit/client";
import { SegmentedBar } from "@/components/charts/charts";
import { JobForm } from "../job-form";
import { deleteCostLine, deleteJob, deleteMileage, linkReceipt, unlinkReceipt, updateJobStatus } from "../actions";
import { CostLineForm, HoursForm, MileageForm } from "./forms";
import { JobPhotos } from "./photos";

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await getOrg();
  const { id } = await params;
  const { edit } = await searchParams;
  const job = await getJobDetail(org.id, id);
  if (!job) notFound();

  if (edit) {
    const [clients, categories] = await Promise.all([clientOptions(org.id), jobCategoryOptions(org.id)]);
    return (
      <Page>
        <PageHeader title="Edit job" back={{ href: `/jobs/${id}`, label: job.name }} />
        <JobForm
          job={{
            ...job,
            startDate: toDateInput(job.startDate),
            endDate: toDateInput(job.endDate),
          }}
          clients={clients}
          categories={categories}
          gstRegistered={org.gstRegistered}
        />
        <form action={deleteJob} className="mt-8 flex justify-center">
          <input type="hidden" name="id" value={job.id} />
          <ConfirmSubmit confirmText="Tap again to delete job">Delete job</ConfirmSubmit>
        </form>
        <p className="footnote mt-2 text-center text-label-2">Deletes its costs and mileage. Receipts and invoices are kept.</p>
      </Page>
    );
  }

  const unlinked = await db
    .select({ id: receipts.id, vendor: receipts.vendor, date: receipts.date, total: receipts.total })
    .from(receipts)
    .where(and(eq(receipts.orgId, org.id), isNull(receipts.jobId), eq(receipts.status, "confirmed")))
    .orderBy(desc(receipts.date))
    .limit(50);

  const f = jobFinancials({
    quotedPrice: job.quotedPrice,
    invoices: job.invoices,
    costLines: job.costLines,
    mileage: job.mileageLogs,
    receipts: job.receipts,
    gstRegistered: org.gstRegistered,
    hoursWorked: job.hoursWorked,
    estimatedCost: job.estimatedCost,
  });
  const statusIndex = JOB_STATUSES.indexOf(job.status);
  const pendingReceipts = job.receipts.filter((r) => r.status === "needs_review");

  return (
    <Page>
      <PageHeader
        title={job.name}
        back={{ href: "/jobs", label: "Jobs" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Pill>
            {job.client && (
              <Link href={`/clients/${job.client.id}`} className="font-medium text-tint-ink">
                {job.client.name}
              </Link>
            )}
            {job.category && <span>{job.category}</span>}
            {job.isRecurring && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" /> {RECURRENCE_LABELS[job.recurrenceInterval ?? ""] ?? "Repeats"}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/jobs/${id}?edit=1`} variant="gray">
              Edit
            </LinkButton>
            <LinkButton href={`/invoices/new?jobId=${id}`} variant="tinted">
              Invoice
            </LinkButton>
          </>
        }
      />

      {/* Status pipeline */}
      <Section title="Progress">
        <ol className="grid grid-cols-5 gap-1.5" aria-label="Job status">
          {JOB_STATUSES.map((s, i) => {
            const done = i < statusIndex;
            const current = i === statusIndex;
            return (
              <li key={s}>
                <form action={updateJobStatus}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    disabled={current}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "pressable flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-[12px] font-semibold leading-tight transition-colors sm:text-[13px]",
                      current && "on-tint bg-tint text-white",
                      done && "bg-tint-soft text-tint-ink",
                      !current && !done && "bg-fill text-label-2 hover:bg-fill-2"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        current ? "bg-white/25" : done ? "bg-tint text-white on-tint" : "bg-surface"
                      )}
                      aria-hidden
                    >
                      {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                    </span>
                    {JOB_STATUS_LABELS[s]}
                  </button>
                </form>
              </li>
            );
          })}
        </ol>
        <p className="footnote mt-3 text-label-2">
          {job.status === "completed"
            ? "Next: tap Invoiced to raise an invoice from this job."
            : job.status === "invoiced"
              ? "Tap Paid when the money lands. It's counted as income on that date."
              : job.status === "paid"
                ? "All done."
                : "Tap a step to move the job along."}
        </p>
      </Section>

      {/* Profit */}
      <Section title="Profit">
        {!f.hasPrice ? (
          <p className="text-label-2">
            Add a price to see profit.{" "}
            <Link href={`/jobs/${id}?edit=1`} className="font-medium text-tint-ink">
              Set price
            </Link>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="footnote text-label-2">Profit{org.gstRegistered ? " (ex GST)" : ""}</div>
                <div className={cn("hero-figure", f.profit < 0 && "text-bad")}>
                  <Money cents={f.profit} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right">
                <KeyValue label="Margin" value={formatPercent(f.margin)} tone={f.margin != null && f.margin < 15 ? "bad" : undefined} />
                <KeyValue label="Per hour" value={f.profitPerHour == null ? "—" : formatCents(f.profitPerHour)} />
                <KeyValue label="Hours" value={job.hoursWorked ? formatQuantity(job.hoursWorked) : "—"} />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-separator pt-4 sm:grid-cols-4">
              <KeyValue label={org.gstRegistered ? "Price (incl. GST)" : "Price"} value={formatCents(f.priceInc)} />
              {org.gstRegistered && <KeyValue label="GST to pay" value={formatCents(f.priceInc - f.revenue)} />}
              <KeyValue label="Revenue" value={formatCents(f.revenue)} />
              <KeyValue label="Costs" value={formatCents(f.costs.total)} />
            </dl>

            {f.costs.total > 0 && (
              <div className="mt-5">
                <SegmentedBar
                  caption="Where the money went"
                  parts={[
                    { key: "profit", name: "Profit", value: Math.max(0, f.profit), color: "var(--series-3)" },
                    { key: "materials", name: "Materials", value: f.costs.materials, color: "var(--series-2)" },
                    { key: "receipts", name: "Receipts", value: f.costs.receipts, color: "var(--series-1)" },
                    { key: "labour", name: "Labour", value: f.costs.labour, color: "var(--series-7)" },
                    { key: "travel", name: "Travel & mileage", value: f.costs.travel + f.costs.mileage, color: "var(--series-4)" },
                    { key: "other", name: "Other", value: f.costs.other, color: "var(--series-5)" },
                  ]}
                />
              </div>
            )}

            {f.costVariance != null && (
              <p className={cn("footnote mt-4 font-medium", f.costVariance > 0 ? "text-bad" : "text-good")}>
                {f.costVariance > 0
                  ? `${formatCents(f.costVariance)} over your expected costs of ${formatCents(toCents(job.estimatedCost))}.`
                  : `${formatCents(-f.costVariance)} under your expected costs of ${formatCents(toCents(job.estimatedCost))}.`}
              </p>
            )}
          </>
        )}
        <div className="mt-4 border-t border-separator pt-4">
          <HoursForm jobId={job.id} />
        </div>
      </Section>

      {/* Costs */}
      <Section title="Costs" footer="Log what you pay others. Don't log your own time as labour; record hours worked instead.">
        {job.costLines.length > 0 && (
          <ul className="-mt-1 mb-4 divide-y divide-separator">
            {job.costLines.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <Pill tone="gray">{COST_TYPE_LABELS[c.type]}</Pill>
                <span className="min-w-0 flex-1 truncate">{c.description || "—"}</span>
                <span className="num text-right">
                  {formatCents(toCents(c.amount))}
                  {toCents(c.gstAmount) > 0 && <span className="footnote block text-label-3">incl. {formatCents(toCents(c.gstAmount))} GST</span>}
                </span>
                <form action={deleteCostLine}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit variant="plain" confirmText="Delete" ariaLabel={`Delete ${c.description ?? "cost"}`}>
                    <Trash2 className="h-4 w-4" />
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
        <CostLineForm jobId={job.id} gstRegistered={org.gstRegistered} />
      </Section>

      {/* Receipts */}
      <Section
        title="Receipts"
        action={
          <Link href={`/receipts/scan?jobId=${job.id}`} className="inline-flex items-center gap-1">
            <Camera className="h-4 w-4" /> Scan for this job
          </Link>
        }
        flush
      >
        {job.receipts.length === 0 ? (
          <p className="p-4 text-label-2">No receipts linked. Scan one, or link one you&apos;ve already saved.</p>
        ) : (
          job.receipts.map((r) => (
            <Row
              key={r.id}
              href={`/receipts/${r.id}`}
              title={r.vendor}
              subtitle={formatDate(r.date)}
              detail={formatCents(toCents(r.total))}
              trailing={
                r.status === "needs_review" ? (
                  <Pill tone="orange">Review</Pill>
                ) : (
                  <form action={unlinkReceipt}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="receiptId" value={r.id} />
                    <SubmitButton variant="plain" size="sm">
                      Unlink
                    </SubmitButton>
                  </form>
                )
              }
              chevron={false}
            />
          ))
        )}
        {unlinked.length > 0 && (
          <form action={linkReceipt} className="flex items-end gap-2 border-t border-separator p-4">
            <input type="hidden" name="jobId" value={job.id} />
            <label className="min-w-0 flex-1">
              <span className="footnote mb-1.5 block px-1 font-medium text-label-2">Link a saved receipt</span>
              <select name="receiptId" className="field" defaultValue="">
                <option value="" disabled>
                  Choose a receipt…
                </option>
                {unlinked.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.vendor} · {formatDate(r.date)} · {formatCents(toCents(r.total))}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton variant="gray">Link</SubmitButton>
          </form>
        )}
        {pendingReceipts.length > 0 && (
          <p className="footnote border-t border-separator px-4 py-3 text-warn">
            {pendingReceipts.length} receipt{pendingReceipts.length === 1 ? " needs" : "s need"} review before it counts toward costs.
          </p>
        )}
      </Section>

      {/* Mileage */}
      <Section title="Mileage">
        {job.mileageLogs.length > 0 && (
          <ul className="-mt-1 mb-4 divide-y divide-separator">
            {job.mileageLogs.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="num w-20 shrink-0 font-medium">{formatQuantity(m.km)} km</span>
                <span className="min-w-0 flex-1 truncate text-label-2">{m.notes || formatDate(m.createdAt)}</span>
                <span className="num">{formatCents(toCents(m.total))}</span>
                <form action={deleteMileage}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="id" value={m.id} />
                  <ConfirmSubmit variant="plain" confirmText="Delete" ariaLabel="Delete trip">
                    <Trash2 className="h-4 w-4" />
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
        <MileageForm jobId={job.id} rate={Number(org.mileageRate)} />
      </Section>

      {/* Invoices */}
      <Section title="Invoices" flush action={<Link href={`/invoices/new?jobId=${id}`}>New invoice</Link>}>
        {job.invoices.length === 0 ? (
          <p className="p-4 text-label-2">Not invoiced yet.</p>
        ) : (
          job.invoices.map((i) => (
            <Row
              key={i.id}
              href={`/invoices/${i.id}`}
              title={i.number}
              subtitle={`Issued ${formatDate(i.issueDate)}${i.dueDate && i.status === "sent" ? ` · due ${formatDate(i.dueDate)}` : ""}`}
              detail={formatCents(toCents(i.total))}
              trailing={<Pill tone={INVOICE_STATUS_TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Pill>}
            />
          ))
        )}
      </Section>

      {/* Photos */}
      <Section title="Photos">
        <JobPhotos jobId={job.id} photos={job.photos.map((p) => ({ id: p.id, imageUrl: p.imageUrl, type: p.type, createdAt: p.createdAt.toISOString() }))} />
      </Section>

      {/* Details */}
      <Section title="Details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KeyValue label="Start" value={formatDate(job.startDate)} />
          <KeyValue label="Finish" value={formatDate(job.endDate)} />
          <KeyValue label="Completed" value={formatDate(job.completedAt)} />
        </dl>
        {job.siteAddress && (
          <a
            href={`https://maps.apple.com/?q=${encodeURIComponent(job.siteAddress)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-medium text-tint-ink"
          >
            <MapPin className="h-4 w-4" /> {job.siteAddress}
          </a>
        )}
        {job.description && <p className="mt-4 whitespace-pre-wrap text-label-2">{job.description}</p>}
        {job.quotes.length > 0 && (
          <p className="footnote mt-4 text-label-2">
            From quote{" "}
            {job.quotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`} className="font-medium text-tint-ink">
                {q.number ?? q.title}
              </Link>
            ))}
          </p>
        )}
      </Section>
    </Page>
  );
}
