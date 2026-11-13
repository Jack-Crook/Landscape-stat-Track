"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { lineItemTotals } from "@/lib/gst";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/kit/ui";

export type EditableLine = { description: string; quantity: string; unitPrice: string };

export function toEditable(items: { description: string; quantity: number; unitPrice: number }[] | undefined): EditableLine[] {
  if (!items || items.length === 0) return [{ description: "", quantity: "1", unitPrice: "" }];
  return items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) }));
}

/**
 * Editable quote/invoice lines (GST-exclusive unit prices). Serialises to a
 * hidden `lineItems` JSON field; the server recomputes totals from it.
 */
export function LineItemsEditor({
  initial,
  gstRegistered,
  error,
  onSubtotalChange,
}: {
  initial: EditableLine[];
  gstRegistered: boolean;
  error?: string;
  onSubtotalChange?: (cents: number) => void;
}) {
  const [rows, setRows] = useState<EditableLine[]>(initial);
  const parsed = useMemo(
    () =>
      rows
        .filter((r) => r.description.trim() || r.unitPrice)
        .map((r) => ({ description: r.description.trim(), quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice.replace(/[$,]/g, "")) || 0 })),
    [rows]
  );
  const totals = lineItemTotals(parsed, gstRegistered);

  const update = (i: number, patch: Partial<EditableLine>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setRows(next);
    if (onSubtotalChange) {
      const p = next.map((r) => ({ quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice.replace(/[$,]/g, "")) || 0 }));
      onSubtotalChange(lineItemTotals(p, false).subtotal);
    }
  };

  return (
    <div>
      <input type="hidden" name="lineItems" value={JSON.stringify(parsed)} />
      <div className="footnote mb-2 hidden grid-cols-[1fr_80px_120px_110px_36px] gap-2 px-1 font-medium text-label-2 sm:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price{gstRegistered ? " (ex GST)" : ""}</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <ul className="space-y-3 sm:space-y-2">
        {rows.map((r, i) => {
          const amount = Math.round((Number(r.quantity) || 0) * (Number(r.unitPrice.replace(/[$,]/g, "")) || 0) * 100);
          return (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl bg-surface-2 p-2 sm:grid-cols-[1fr_80px_120px_110px_36px] sm:items-center sm:bg-transparent sm:p-0">
              <input
                aria-label={`Line ${i + 1} description`}
                className="field col-span-3 sm:col-span-1"
                placeholder="e.g. Supply & lay Sir Walter turf (m²)"
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <label className="block">
                <span className="caption mb-1 block px-1 text-label-2 sm:hidden">Qty</span>
                <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className="field num" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              </label>
              <label className="block">
                <span className="caption mb-1 block px-1 text-label-2 sm:hidden">Unit price{gstRegistered ? " (ex GST)" : ""}</span>
                <input
                  aria-label={`Line ${i + 1} unit price`}
                  inputMode="decimal"
                  className="field num"
                  placeholder="0.00"
                  value={r.unitPrice}
                  onChange={(e) => update(i, { unitPrice: e.target.value })}
                />
              </label>
              <span className="num hidden text-right font-medium sm:block">{formatCents(amount)}</span>
              <Button
                type="button"
                variant="plain"
                size="sm"
                aria-label={`Remove line ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="self-end sm:self-center"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="plain" size="sm" className="mt-2" onClick={() => setRows([...rows, { description: "", quantity: "1", unitPrice: "" }])}>
        <Plus className="h-4 w-4" /> Add line
      </Button>
      {error && (
        <p className="footnote mt-1 px-1 text-bad" role="alert">
          {error}
        </p>
      )}
      <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 border-t border-separator pt-3">
        <div className="flex justify-between text-label-2">
          <dt>Subtotal</dt>
          <dd className="num">{formatCents(totals.subtotal)}</dd>
        </div>
        {gstRegistered && (
          <div className="flex justify-between text-label-2">
            <dt>GST (10%)</dt>
            <dd className="num">{formatCents(totals.gst)}</dd>
          </div>
        )}
        <div className="headline flex justify-between">
          <dt>Total</dt>
          <dd className="num" data-testid="line-items-total">
            {formatCents(totals.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
