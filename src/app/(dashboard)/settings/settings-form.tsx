"use client";

import { useActionState } from "react";
import { Field, Section, Toggle } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import type { FormState } from "@/lib/actions";
import type { Organisation } from "@/db/schema";
import { saveSettings } from "./actions";

export function SettingsForm({ org }: { org: Organisation }) {
  const [state, action] = useActionState<FormState, FormData>(saveSettings, {});
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <Section title="Business" footer="Shown on your quotes and invoices.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="name" error={e.name}>
            <input id="name" name="name" className="field" defaultValue={org.name} aria-invalid={!!e.name} />
          </Field>
          <Field label="Your name" htmlFor="ownerName">
            <input id="ownerName" name="ownerName" className="field" defaultValue={org.ownerName ?? ""} />
          </Field>
          <Field label="ABN" htmlFor="abn" error={e.abn}>
            <input id="abn" name="abn" inputMode="numeric" className="field num" defaultValue={org.abn ?? ""} aria-invalid={!!e.abn} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" type="tel" className="field" defaultValue={org.phone ?? ""} />
          </Field>
          <Field label="Email" htmlFor="email" error={e.email}>
            <input id="email" name="email" type="email" className="field" defaultValue={org.email ?? ""} />
          </Field>
          <Field label="Address" htmlFor="address">
            <input id="address" name="address" className="field" defaultValue={org.address ?? ""} />
          </Field>
        </div>
      </Section>

      <Section title="Tax" footer="These drive GST, BAS and the income tax estimate. Not sure? Ask your accountant; you can change them any time.">
        <div className="space-y-4">
          <Toggle name="gstRegistered" defaultChecked={org.gstRegistered} label="Registered for GST" description="Charge 10% GST on invoices and claim GST credits on purchases." />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Business structure" htmlFor="entityType">
              <select id="entityType" name="entityType" className="field" defaultValue={org.entityType}>
                <option value="sole_trader">Sole trader</option>
                <option value="company">Company (Pty Ltd)</option>
              </select>
            </Field>
            <Field label="BAS lodged" htmlFor="basFrequency">
              <select id="basFrequency" name="basFrequency" className="field" defaultValue={org.basFrequency}>
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="GST accounting" htmlFor="accountingBasis" hint="Most small businesses use cash.">
              <select id="accountingBasis" name="accountingBasis" className="field" defaultValue={org.accountingBasis}>
                <option value="cash">Cash (when paid)</option>
                <option value="accrual">Accrual (when invoiced)</option>
              </select>
            </Field>
            <Field label="Other taxable income this year" htmlFor="otherIncome" error={e.otherIncome} hint="Wages from a job etc. Pushes business profit into a higher bracket." className="sm:col-span-2">
              <input id="otherIncome" name="otherIncome" inputMode="decimal" className="field num" defaultValue={Number(org.otherIncome) ? org.otherIncome : ""} placeholder="0" />
            </Field>
            <Field label="Car rate ($/km)" htmlFor="mileageRate" error={e.mileageRate} hint="ATO cents per km.">
              <input id="mileageRate" name="mileageRate" inputMode="decimal" className="field num" defaultValue={Number(org.mileageRate).toFixed(2)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Invoices & quotes">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Invoice prefix" htmlFor="invoicePrefix">
            <input id="invoicePrefix" name="invoicePrefix" className="field" defaultValue={org.invoicePrefix} />
          </Field>
          <Field label="Next invoice no." htmlFor="nextInvoiceNumber" error={e.nextInvoiceNumber}>
            <input id="nextInvoiceNumber" name="nextInvoiceNumber" inputMode="numeric" className="field num" defaultValue={org.nextInvoiceNumber} />
          </Field>
          <Field label="Quote prefix" htmlFor="quotePrefix">
            <input id="quotePrefix" name="quotePrefix" className="field" defaultValue={org.quotePrefix} />
          </Field>
          <Field label="Payment terms (days)" htmlFor="paymentTermsDays" error={e.paymentTermsDays}>
            <input id="paymentTermsDays" name="paymentTermsDays" inputMode="numeric" className="field num" defaultValue={org.paymentTermsDays} />
          </Field>
          <Field label="Your usual hourly rate" htmlFor="defaultHourlyRate" hint="Optional, for quoting labour." className="sm:col-span-2">
            <input id="defaultHourlyRate" name="defaultHourlyRate" inputMode="decimal" className="field num" defaultValue={org.defaultHourlyRate ?? ""} />
          </Field>
          <Field label="Default invoice note" htmlFor="invoiceNotes" className="sm:col-span-4">
            <textarea id="invoiceNotes" name="invoiceNotes" className="field" defaultValue={org.invoiceNotes ?? ""} placeholder="Thanks for your business! Payment due within 14 days." />
          </Field>
        </div>
      </Section>

      <Section title="Getting paid" footer="Printed on invoices so clients can pay by bank transfer.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Account name" htmlFor="bankAccountName">
            <input id="bankAccountName" name="bankAccountName" className="field" defaultValue={org.bankAccountName ?? ""} />
          </Field>
          <Field label="BSB" htmlFor="bankBsb" error={e.bankBsb}>
            <input id="bankBsb" name="bankBsb" inputMode="numeric" className="field num" defaultValue={org.bankBsb ?? ""} placeholder="000-000" />
          </Field>
          <Field label="Account number" htmlFor="bankAccountNumber" error={e.bankAccountNumber}>
            <input id="bankAccountNumber" name="bankAccountNumber" inputMode="numeric" className="field num" defaultValue={org.bankAccountNumber ?? ""} />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
