"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field } from "@/components/kit/ui";
import { FormMessage, SubmitButton } from "@/components/kit/client";
import { COST_TYPE_LABELS, COST_TYPES } from "@/lib/constants";
import type { FormState } from "@/lib/actions";
import { addCostLine, addMileage, logHours } from "../actions";

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function CostLineForm({ jobId, gstRegistered }: { jobId: string; gstRegistered: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(addCostLine, {});
  const ref = useResetOnSuccess(state);
  const e = state.errors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_130px]">
        <Field label="Type" htmlFor="cost-type">
          <select id="cost-type" name="type" className="field" defaultValue="materials">
            {COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What for" htmlFor="cost-description">
          <input id="cost-description" name="description" className="field" placeholder="e.g. Labourer, 6 hrs" />
        </Field>
        <Field label="Amount" htmlFor="cost-amount" error={e.amount}>
          <input id="cost-amount" name="amount" inputMode="decimal" className="field num" placeholder="0.00" aria-invalid={!!e.amount} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {gstRegistered ? (
          <label className="footnote flex items-center gap-2 text-label-2">
            <input type="checkbox" name="gstInclusive" defaultChecked className="h-4 w-4 accent-[var(--tint)]" />
            Includes GST (untick for wages and GST-free costs)
          </label>
        ) : (
          <span />
        )}
        <SubmitButton size="sm" variant="tinted" pendingText="Adding…">
          Add cost
        </SubmitButton>
      </div>
      <FormMessage state={state.ok ? null : state} />
    </form>
  );
}

export function MileageForm({ jobId, rate }: { jobId: string; rate: number }) {
  const [state, action] = useActionState<FormState, FormData>(addMileage, {});
  const ref = useResetOnSuccess(state);
  const e = state.errors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-[130px_1fr_auto] sm:items-end">
        <Field label="Distance (km)" htmlFor="km" error={e.km}>
          <input id="km" name="km" inputMode="decimal" className="field num" placeholder="0" aria-invalid={!!e.km} />
        </Field>
        <Field label="Trip" htmlFor="km-notes">
          <input id="km-notes" name="notes" className="field" placeholder="e.g. Yard → site → tip → yard" />
        </Field>
        <SubmitButton size="md" variant="tinted" pendingText="Logging…">
          Log trip
        </SubmitButton>
      </div>
      <p className="footnote text-label-3">Claimed at ${rate.toFixed(2)}/km (ATO cents per km). Change the rate in Settings.</p>
      <FormMessage state={state.ok ? null : state} />
    </form>
  );
}

export function HoursForm({ jobId }: { jobId: string }) {
  const [state, action] = useActionState<FormState, FormData>(logHours, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex items-end gap-2" noValidate>
      <input type="hidden" name="jobId" value={jobId} />
      <Field label="Add hours" htmlFor="hours" error={state.errors?.hours} className="w-28">
        <input id="hours" name="hours" inputMode="decimal" className="field num" placeholder="0" />
      </Field>
      <SubmitButton size="md" variant="gray">
        Add
      </SubmitButton>
      {state.ok && state.message && (
        <span role="status" className="footnote pb-3 text-good">
          {state.message}
        </span>
      )}
    </form>
  );
}
