"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClasses } from "./ui";
import { cn } from "@/lib/utils";

type Variant = Parameters<typeof buttonClasses>[0];
type Size = Parameters<typeof buttonClasses>[1];

/** Submit button that shows pending state for its enclosing <form>. */
export function SubmitButton({
  children,
  pendingText,
  variant = "filled",
  size = "md",
  className,
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses(variant, size, className)}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * Destructive submit that needs a second tap within 3 seconds — forgiving
 * without a modal dialog interrupting the flow.
 */
export function ConfirmSubmit({
  children,
  confirmText = "Tap again to confirm",
  className,
  size = "sm",
  variant = "destructive",
  ariaLabel,
}: {
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
  size?: Size;
  variant?: Variant;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { pending } = useFormStatus();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type={armed ? "submit" : "button"}
      aria-label={armed ? confirmText : ariaLabel}
      disabled={pending}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
      className={buttonClasses(armed ? "filled" : variant, size, cn(armed && "!bg-bad !text-white", className))}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : armed ? confirmText : children}
    </button>
  );
}

/** Auto-submits its form when a <select> inside changes (status pickers etc). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function FormMessage({ state }: { state?: { message?: string; ok?: boolean } | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("footnote rounded-xl px-3 py-2", state.ok ? "bg-tint-soft text-tint-ink" : "bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] text-bad")}>
      {state.message}
    </p>
  );
}
