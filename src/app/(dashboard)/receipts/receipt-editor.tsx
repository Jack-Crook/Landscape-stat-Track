"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Section } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import type { FormState } from "@/lib/actions";
import { formatCents } from "@/lib/format";
import { gstFromInclusive } from "@/lib/gst";
import { parseAmountInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveReceipt } from "./actions";

export type EditorItem = {
  description: string;
  itemName: string;
  category: string;
  quantity: string;
  unitPrice: string;
  total: string;
  gstFree: boolean;
  brand?: string | null;
  sku?: string | null;
  unit?: string | null;
};

export type EditorReceipt = {
  id?: string;
  fileId?: string | null;
  vendor: string;
  vendorBranch?: string | null;
  vendorAbn?: string | null;
  receiptNumber?: string | null;
  date: string;
  time?: string | null;
  paymentMethod?: string | null;
  cardLast4?: string | null;
  total: string;
  gstAmount: string;
  category: string;
  jobId?: string | null;
  isCapital: boolean;
  notes?: string | null;
  items: EditorItem[];
};

const blankItem = (): EditorItem => ({ description: "", itemName: "", category: "materials", quantity: "1", unitPrice: "", total: "", gstFree: false });

export function ReceiptEditor({
  receipt,
  jobs,
  gstRegistered,
  hasMoreToReview,
  confirmed = false,
}: {
  receipt: EditorReceipt;
  jobs: { id: string; name: string }[];
  gstRegistered: boolean;
  hasMoreToReview: boolean;
  /** Already-confirmed receipts just save edits. */
  confirmed?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveReceipt, {});
  const [items, setItems] = useState<EditorItem[]>(receipt.items.length ? receipt.items : []);
  const [total, setTotal] = useState(receipt.total);
  const [gst, setGst] = useState(receipt.gstAmount);
  const e = state.errors ?? {};

  const sums = useMemo(() => {
    let lines = 0;
    let lineGst = 0;
    for (const i of items) {
      const c = parseAmountInput(i.total) ?? 0;
      lines += c;
      if (!i.gstFree) lineGst += gstFromInclusive(c);
    }
    return { lines, lineGst };
  }, [items]);
  const totalCents = parseAmountInput(total) ?? 0;
  const gstCents = parseAmountInput(gst) ?? 0;
  const mismatch = items.length > 0 && Math.abs(sums.lines - totalCents) > 5;
  const gstTooHigh = gstCents > Math.round(totalCents / 11) + 2;

  const update = (idx: number, p: Partial<EditorItem>) =>
    setItems((list) =>
      list.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...p };
        // Typing qty × unit price fills the line total.
        if (("quantity" in p || "unitPrice" in p) && next.unitPrice) {
          const u = parseAmountInput(next.unitPrice);
          const q = Number(next.quantity);
          if (u != null && q > 0) next.total = ((u * q) / 100).toFixed(2);
        }
        return next;
      })
    );

  return (
    <form action={action} noValidate>
      {receipt.id && <input type="hidden" name="id" value={receipt.id} />}
      {receipt.fileId && <input type="hidden" name="fileId" value={receipt.fileId} />}
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {hasMoreToReview && <input type="hidden" name="continue" value="1" />}
      <FormMessage state={state} />

      <Section title="Supplier">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="vendor" error={e.vendor}>
            <input id="vendor" name="vendor" className="field" defaultValue={receipt.vendor === "Unknown supplier" ? "" : receipt.vendor} placeholder="e.g. Bunnings Warehouse" aria-invalid={!!e.vendor} />
          </Field>
          <Field label="Store / branch" htmlFor="vendorBranch">
            <input id="vendorBranch" name="vendorBranch" className="field" defaultValue={receipt.vendorBranch ?? ""} />
          </Field>
          <Field label="ABN" htmlFor="vendorAbn" error={e.vendorAbn} hint="Needed to claim GST on purchases over $82.50.">
            <input id="vendorAbn" name="vendorAbn" inputMode="numeric" className="field num" defaultValue={receipt.vendorAbn ?? ""} aria-invalid={!!e.vendorAbn} />
          </Field>
          <Field label="Receipt / invoice no." htmlFor="receiptNumber">
            <input id="receiptNumber" name="receiptNumber" className="field" defaultValue={receipt.receiptNumber ?? ""} />
          </Field>
        </div>
      </Section>

      <Section title="Purchase">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="date" error={e.date}>
            <input id="date" name="date" type="date" className="field" defaultValue={receipt.date} aria-invalid={!!e.date} />
          </Field>
          <Field label="Time" htmlFor="time">
            <input id="time" name="time" type="time" className="field" defaultValue={receipt.time ?? ""} />
          </Field>
          <Field label="Paid by" htmlFor="paymentMethod">
            <select id="paymentMethod" name="paymentMethod" className="field" defaultValue={receipt.paymentMethod ?? ""}>
              <option value="">Unknown</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Total paid" htmlFor="total" error={e.total}>
            <input id="total" name="total" inputMode="decimal" className="field num text-[17px] font-semibold" value={total} onChange={(ev) => setTotal(ev.target.value)} aria-invalid={!!e.total} />
          </Field>
          <Field label={gstRegistered ? "GST included" : "GST included (not claimable)"} htmlFor="gstAmount" error={e.gstAmount ?? (gstTooHigh ? "More than 1/11 of the total" : undefined)}>
            <input id="gstAmount" name="gstAmount" inputMode="decimal" className="field num" value={gst} onChange={(ev) => setGst(ev.target.value)} aria-invalid={gstTooHigh} />
          </Field>
          <Field label="Card ending" htmlFor="cardLast4">
            <input id="cardLast4" name="cardLast4" inputMode="numeric" maxLength={4} className="field num" defaultValue={receipt.cardLast4 ?? ""} />
          </Field>
        </div>
        {totalCents > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="gray" size="sm" onClick={() => setGst((gstFromInclusive(totalCents) / 100).toFixed(2))}>
              GST = 1/11 of total
            </Button>
            {items.length > 0 && (
              <Button type="button" variant="gray" size="sm" onClick={() => setGst((sums.lineGst / 100).toFixed(2))}>
                GST from lines ({formatCents(sums.lineGst)})
              </Button>
            )}
            <Button type="button" variant="gray" size="sm" onClick={() => setGst("0.00")}>
              No GST
            </Button>
          </div>
        )}
      </Section>

      <Section
        title={`Items (${items.length})`}
        action={
          <button type="button" className="inline-flex items-center gap-1" onClick={() => setItems([...items, blankItem()])}>
            <Plus className="h-4 w-4" /> Add item
          </button>
        }
        footer="“Item” is the general name used to group spending, so “Shovel” collects every shovel from every shop."
      >
        {items.length === 0 ? (
          <p className="text-label-2">No line items. Add them to see item-level spending, or just save the total.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3" data-testid="receipt-item">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <input aria-label={`Item ${i + 1} as printed`} className="field footnote" placeholder="As printed" value={it.description} onChange={(ev) => update(i, { description: ev.target.value })} />
                  <input aria-label={`Item ${i + 1} name`} className="field font-medium" placeholder="Item (e.g. Shovel)" value={it.itemName} onChange={(ev) => update(i, { itemName: ev.target.value })} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_0.6fr_0.8fr_0.9fr_auto_auto]">
                  <select aria-label={`Item ${i + 1} category`} className="field col-span-2 sm:col-span-1" value={it.category} onChange={(ev) => update(i, { category: ev.target.value })}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" className="field num" value={it.quantity} onChange={(ev) => update(i, { quantity: ev.target.value })} />
                  <input aria-label={`Item ${i + 1} unit price`} inputMode="decimal" className="field num" placeholder="Each" value={it.unitPrice} onChange={(ev) => update(i, { unitPrice: ev.target.value })} />
                  <input aria-label={`Item ${i + 1} total`} inputMode="decimal" className="field num font-semibold" placeholder="Total" value={it.total} onChange={(ev) => update(i, { total: ev.target.value })} />
                  <label className="footnote flex items-center gap-1.5 whitespace-nowrap px-1 text-label-2">
                    <input type="checkbox" checked={it.gstFree} onChange={(ev) => update(i, { gstFree: ev.target.checked })} className="h-4 w-4 accent-[var(--tint)]" />
                    GST-free
                  </label>
                  <Button type="button" variant="plain" size="sm" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <p className={cn("footnote mt-3 font-medium", mismatch ? "text-warn" : "text-good")} role="status">
            {mismatch
              ? `Items add up to ${formatCents(sums.lines)}, ${formatCents(Math.abs(totalCents - sums.lines))} ${totalCents > sums.lines ? "less" : "more"} than the total.`
              : `Items add up to the total (${formatCents(sums.lines)}).`}
          </p>
        )}
      </Section>

      <Section title="Where it goes">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main category" htmlFor="category">
            <select id="category" name="category" className="field" defaultValue={receipt.category}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job" htmlFor="jobId" hint="Linked receipts count toward that job's costs.">
            <select id="jobId" name="jobId" className="field" defaultValue={receipt.jobId ?? ""}>
              <option value="">General business expense</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-3 sm:col-span-2">
            <input type="checkbox" name="isCapital" defaultChecked={receipt.isCapital} className="mt-1 h-4 w-4 accent-[var(--tint)]" />
            <span>
              <span className="font-medium">Equipment or vehicle (capital purchase)</span>
              <span className="footnote block text-label-2">Things that last years, like a mower or trailer. Reported at G10 on your BAS instead of G11.</span>
            </span>
          </label>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <textarea id="notes" name="notes" className="field" defaultValue={receipt.notes ?? ""} />
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap justify-end gap-2">
        {!confirmed && (
          <SubmitButton variant="gray" name="intent" value="later">
            Save for later
          </SubmitButton>
        )}
        <SubmitButton name="intent" value="confirm" pendingText="Saving…">
          {confirmed ? "Save changes" : hasMoreToReview ? "Confirm & next" : "Confirm receipt"}
        </SubmitButton>
      </div>
    </form>
  );
}
