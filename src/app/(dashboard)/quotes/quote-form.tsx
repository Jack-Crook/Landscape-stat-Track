"use client";

import { useActionState, useState } from "react";
import { Field, Section } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import { LineItemsEditor, toEditable } from "@/components/forms/line-items-editor";
import type { FormState } from "@/lib/actions";
import { formatCents } from "@/lib/format";
import { priceForMargin } from "@/lib/finance";
import { saveQuote } from "./actions";

export type QuoteFormValues = {
  id?: string;
  title?: string;
  clientId?: string | null;
  category?: string | null;
  validUntil?: string;
  notes?: string | null;
  estimatedCost?: string | null;
  lineItems?: { description: string; quantity: number; unitPrice: number }[];
};

export function QuoteForm({
  quote,
  clients,
  categories,
  gstRegistered,
  categoryMargins,
}: {
  quote?: QuoteFormValues;
  clients: { id: string; name: string }[];
  categories: string[];
  gstRegistered: boolean;
  /** Median past margin (%) per job category, from completed jobs. */
  categoryMargins: Record<string, number>;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveQuote, {});
  const [cost, setCost] = useState(quote?.estimatedCost ?? "");
  const [margin, setMargin] = useState(35);
  const [category, setCategory] = useState(quote?.category ?? "");
  const [subtotal, setSubtotal] = useState(() =>
    Math.round((quote?.lineItems ?? []).reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100)
  );
  const e = state.errors ?? {};

  const costCents = Math.round((Number(String(cost).replace(/[$,]/g, "")) || 0) * 100);
  const suggested = costCents > 0 ? priceForMargin(costCents, margin) : null;
  const currentMargin = subtotal > 0 && costCents > 0 ? ((subtotal - costCents) / subtotal) * 100 : null;
  const past = categoryMargins[category];

  return (
    <form action={action} noValidate>
      {quote?.id && <input type="hidden" name="id" value={quote.id} />}
      <FormMessage state={state} />
      <Section title="Quote">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" error={e.title} className="sm:col-span-2">
            <input id="title" name="title" className="field" defaultValue={quote?.title} placeholder="e.g. Front garden makeover" aria-invalid={!!e.title} />
          </Field>
          <Field label="Client" htmlFor="clientId">
            <select id="clientId" name="clientId" className="field" defaultValue={quote?.clientId ?? ""}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="category" hint="Used for win-rate and margin insights.">
            <input id="category" name="category" list="quote-categories" className="field" value={category} onChange={(ev) => setCategory(ev.target.value)} />
            <datalist id="quote-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Valid until" htmlFor="validUntil" error={e.validUntil}>
            <input id="validUntil" name="validUntil" type="date" className="field" defaultValue={quote?.validUntil} />
          </Field>
        </div>
      </Section>

      <Section title="Lines">
        <LineItemsEditor initial={toEditable(quote?.lineItems)} gstRegistered={gstRegistered} error={e.lineItems?.[0]} onSubtotalChange={setSubtotal} />
      </Section>

      <Section
        title="Pricing helper"
        footer="Private: never shown to the client. Your expected costs are carried onto the job so you can see whether it blew out."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your expected costs (ex GST)" htmlFor="estimatedCost" error={e.estimatedCost}>
            <input id="estimatedCost" name="estimatedCost" inputMode="decimal" className="field num" value={cost} onChange={(ev) => setCost(ev.target.value)} placeholder="Materials, hire, labour…" />
          </Field>
          <Field label={`Target margin: ${margin}%`} htmlFor="margin">
            <input id="margin" type="range" min={5} max={70} step={1} value={margin} onChange={(ev) => setMargin(Number(ev.target.value))} className="mt-3 w-full accent-[var(--tint)]" />
          </Field>
        </div>
        {suggested != null && (
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-fill p-4 sm:grid-cols-3">
            <div>
              <div className="footnote text-label-2">Suggested price (ex GST)</div>
              <div className="num headline">{formatCents(suggested)}</div>
            </div>
            <div>
              <div className="footnote text-label-2">This quote&apos;s margin</div>
              <div className={`num headline ${currentMargin != null && currentMargin < margin ? "text-warn" : ""}`}>
                {currentMargin == null ? "—" : `${currentMargin.toFixed(0)}%`}
              </div>
            </div>
            {past != null && (
              <div>
                <div className="footnote text-label-2">Your usual on {category}</div>
                <div className="num headline">{past.toFixed(0)}%</div>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Notes for the client">
        <textarea name="notes" className="field" defaultValue={quote?.notes ?? ""} placeholder="Inclusions, exclusions, timing, payment terms…" aria-label="Notes" />
      </Section>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{quote?.id ? "Save quote" : "Create quote"}</SubmitButton>
      </div>
    </form>
  );
}
