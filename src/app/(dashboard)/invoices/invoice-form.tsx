"use client";

import { useActionState } from "react";
import { Field, Section } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import { LineItemsEditor, toEditable } from "@/components/forms/line-items-editor";
import type { FormState } from "@/lib/actions";
import { saveInvoice } from "./actions";

export type InvoiceFormValues = {
  id?: string;
  clientId?: string | null;
  jobId?: string | null;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
  lineItems?: { description: string; quantity: number; unitPrice: number }[];
};

export function InvoiceForm({
  invoice,
  clients,
  jobs,
  gstRegistered,
}: {
  invoice: InvoiceFormValues;
  clients: { id: string; name: string }[];
  jobs: { id: string; name: string }[];
  gstRegistered: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveInvoice, {});
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      {invoice.id && <input type="hidden" name="id" value={invoice.id} />}
      <FormMessage state={state} />
      <Section title="Bill to">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="clientId">
            <select id="clientId" name="clientId" className="field" defaultValue={invoice.clientId ?? ""}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="For job" htmlFor="jobId" hint="Linking a job updates its status and profit.">
            <select id="jobId" name="jobId" className="field" defaultValue={invoice.jobId ?? ""}>
              <option value="">No job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Issue date" htmlFor="issueDate" error={e.issueDate}>
            <input id="issueDate" name="issueDate" type="date" className="field" defaultValue={invoice.issueDate} />
          </Field>
          <Field label="Due date" htmlFor="dueDate" error={e.dueDate}>
            <input id="dueDate" name="dueDate" type="date" className="field" defaultValue={invoice.dueDate} aria-invalid={!!e.dueDate} />
          </Field>
        </div>
      </Section>
      <Section title="Lines">
        <LineItemsEditor initial={toEditable(invoice.lineItems)} gstRegistered={gstRegistered} error={e.lineItems?.[0]} />
      </Section>
      <Section title="Notes" footer="Payment details from Settings are added to the PDF automatically.">
        <textarea name="notes" className="field" defaultValue={invoice.notes ?? ""} aria-label="Notes" placeholder="Thanks for your business!" />
      </Section>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{invoice.id ? "Save invoice" : "Create draft"}</SubmitButton>
      </div>
    </form>
  );
}
