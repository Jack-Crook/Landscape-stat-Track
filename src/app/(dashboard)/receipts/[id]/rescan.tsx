"use client";

import { useActionState } from "react";
import { RotateCcw } from "lucide-react";
import { SubmitButton } from "@/components/kit/client";
import type { FormState } from "@/lib/actions";
import { rescanReceipt } from "../actions";

export function RescanButton({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(rescanReceipt, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state.message && (
        <span className="footnote text-bad" role="alert">
          {state.message}
        </span>
      )}
      <SubmitButton variant="gray" pendingText="Reading…">
        <RotateCcw className="h-4 w-4" /> Read again
      </SubmitButton>
    </form>
  );
}
