"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Section, Toggle } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import type { FormState } from "@/lib/actions";
import { saveJob } from "./actions";

export type JobFormValues = {
  id?: string;
  name?: string;
  clientId?: string | null;
  category?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  quotedPrice?: string | null;
  estimatedCost?: string | null;
  startDate?: string;
  endDate?: string;
  hoursWorked?: string | null;
  isRecurring?: boolean;
  recurrenceInterval?: string | null;
};

export function JobForm({
  job,
  clients,
  categories,
  gstRegistered,
}: {
  job?: JobFormValues;
  clients: { id: string; name: string; address: string | null }[];
  categories: string[];
  gstRegistered: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveJob, {});
  const [recurring, setRecurring] = useState(!!job?.isRecurring);
  const [siteAddress, setSiteAddress] = useState(job?.siteAddress ?? "");
  const e = state.errors ?? {};

  return (
    <form action={action} noValidate>
      {job?.id && <input type="hidden" name="id" value={job.id} />}
      <FormMessage state={state} />
      <Section title="Job">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job name" htmlFor="name" error={e.name} className="sm:col-span-2">
            <input id="name" name="name" className="field" defaultValue={job?.name} placeholder="e.g. Backyard turf & edging" aria-invalid={!!e.name} />
          </Field>
          <Field
            label="Client"
            htmlFor="clientId"
            hint={
              <Link href="/clients/new?returnTo=/jobs/new" className="text-tint-ink">
                Add a new client
              </Link>
            }
          >
            <select
              id="clientId"
              name="clientId"
              className="field"
              defaultValue={job?.clientId ?? ""}
              onChange={(ev) => {
                const c = clients.find((x) => x.id === ev.target.value);
                if (c?.address && !siteAddress) setSiteAddress(c.address);
              }}
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="category">
            <input id="category" name="category" list="job-categories" className="field" defaultValue={job?.category ?? ""} placeholder="Choose or type" />
            <datalist id="job-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Site address" htmlFor="siteAddress" className="sm:col-span-2">
            <input id="siteAddress" name="siteAddress" className="field" value={siteAddress} onChange={(ev) => setSiteAddress(ev.target.value)} autoComplete="street-address" />
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <textarea id="description" name="description" className="field" defaultValue={job?.description ?? ""} placeholder="Scope of work, materials, access…" />
          </Field>
        </div>
      </Section>

      <Section title="Money" footer="Profit is worked out from the price minus everything you log against the job: costs, receipts and mileage.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={gstRegistered ? "Price to client (incl. GST)" : "Price to client"} htmlFor="quotedPrice" error={e.quotedPrice}>
            <input id="quotedPrice" name="quotedPrice" inputMode="decimal" className="field num" defaultValue={job?.quotedPrice ?? ""} placeholder="0.00" aria-invalid={!!e.quotedPrice} />
          </Field>
          <Field label="Expected costs (ex GST)" htmlFor="estimatedCost" error={e.estimatedCost} hint="Optional. Flags jobs that blow out.">
            <input id="estimatedCost" name="estimatedCost" inputMode="decimal" className="field num" defaultValue={job?.estimatedCost ?? ""} placeholder="0.00" aria-invalid={!!e.estimatedCost} />
          </Field>
        </div>
      </Section>

      <Section title="Schedule">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start" htmlFor="startDate" error={e.startDate}>
            <input id="startDate" name="startDate" type="date" className="field" defaultValue={job?.startDate} />
          </Field>
          <Field label="Finish" htmlFor="endDate" error={e.endDate}>
            <input id="endDate" name="endDate" type="date" className="field" defaultValue={job?.endDate} aria-invalid={!!e.endDate} />
          </Field>
          <Field label="Hours worked" htmlFor="hoursWorked" error={e.hoursWorked}>
            <input id="hoursWorked" name="hoursWorked" inputMode="decimal" className="field num" defaultValue={job?.hoursWorked ?? ""} placeholder="0" />
          </Field>
        </div>
        <div className="mt-4 border-t border-separator pt-3">
          <div onChange={(ev) => setRecurring((ev.target as HTMLInputElement).checked)}>
            <Toggle name="isRecurring" defaultChecked={job?.isRecurring} label="Repeats" description="Completing a visit books the next one automatically." />
          </div>
          {recurring && (
            <Field label="How often" htmlFor="recurrenceInterval" error={e.recurrenceInterval} className="mt-3 max-w-xs">
              <select id="recurrenceInterval" name="recurrenceInterval" className="field" defaultValue={job?.recurrenceInterval ?? "fortnightly"}>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
          )}
        </div>
      </Section>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{job?.id ? "Save changes" : "Create job"}</SubmitButton>
      </div>
    </form>
  );
}
