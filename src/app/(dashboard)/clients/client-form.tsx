"use client";

import { useActionState } from "react";
import { Field, Section, Toggle } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import type { FormState } from "@/lib/actions";
import { saveClient } from "./actions";

type ClientValues = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isPreferred?: boolean;
};

export function ClientForm({ client, returnTo }: { client?: ClientValues; returnTo?: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveClient, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-1" noValidate>
      {client?.id && <input type="hidden" name="id" value={client.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <FormMessage state={state} />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={e.name} className="sm:col-span-2">
            <input id="name" name="name" className="field" defaultValue={client?.name} autoComplete="name" required aria-invalid={!!e.name} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={e.phone}>
            <input id="phone" name="phone" type="tel" className="field" defaultValue={client?.phone ?? ""} autoComplete="tel" />
          </Field>
          <Field label="Email" htmlFor="email" error={e.email}>
            <input id="email" name="email" type="email" className="field" defaultValue={client?.email ?? ""} autoComplete="email" aria-invalid={!!e.email} />
          </Field>
          <Field label="Address" htmlFor="address" error={e.address} className="sm:col-span-2">
            <input id="address" name="address" className="field" defaultValue={client?.address ?? ""} autoComplete="street-address" />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2" hint="Gate codes, dog in the yard, preferred days…">
            <textarea id="notes" name="notes" className="field" defaultValue={client?.notes ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Toggle name="isPreferred" defaultChecked={client?.isPreferred} label="Preferred client" description="Shows a star in your client list." />
          </div>
        </div>
      </Section>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{client?.id ? "Save changes" : "Add client"}</SubmitButton>
      </div>
    </form>
  );
}
