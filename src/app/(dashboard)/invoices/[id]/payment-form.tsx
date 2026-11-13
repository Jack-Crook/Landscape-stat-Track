"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import type { FormState } from "@/lib/actions";
import { recordPayment } from "../actions";

export function PaymentForm({ id, today }: { id: string; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(recordPayment, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label>
        <span className="footnote mb-1.5 block px-1 font-medium text-label-2">Paid on</span>
        <input name="paidAt" type="date" defaultValue={today} className="field" aria-invalid={!!state.errors?.paidAt} />
      </label>
      <SubmitButton pendingText="Saving…">Record payment</SubmitButton>
      <div className="w-full">
        <FormMessage state={state.ok ? null : { message: state.errors?.paidAt?.[0] ?? state.message }} />
      </div>
    </form>
  );
}
