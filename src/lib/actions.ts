import { z } from "zod";
import { parseAmountInput } from "./money";
import { parseDateOnly } from "./periods";

/** What every form server action returns to `useActionState`. */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional());
export const requiredText = (msg: string) => z.string({ error: msg }).trim().min(1, msg).max(500);

/** Optional money input → cents (number) | undefined. Accepts "$1,234.50". */
export const optionalMoney = z.preprocess(
  emptyToUndefined,
  z
    .unknown()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const c = parseAmountInput(v);
      if (c == null || c < 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount like 120 or 120.50" });
        return z.NEVER;
      }
      return c;
    })
    .optional()
);

export const requiredMoney = z.unknown().transform((v, ctx) => {
  const c = parseAmountInput(v);
  if (c == null || c < 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 120 or 120.50" });
    return z.NEVER;
  }
  return c;
});

export const optionalDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const d = parseDateOnly(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
      return d;
    })
);

export const requiredDate = z.string({ error: "Pick a date" }).transform((v, ctx) => {
  const d = parseDateOnly(v);
  if (!d) {
    ctx.addIssue({ code: "custom", message: "Pick a date" });
    return z.NEVER;
  }
  return d;
});

export const optionalNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number({ error: "Enter a number" }).nonnegative("Can't be negative").optional()
);

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

/** FormData → plain object (last value wins), for zod. */
export function formObject(fd: FormData): Record<string, FormDataEntryValue> {
  const out: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of fd.entries()) out[k] = v;
  return out;
}

export function invalid(error: z.ZodError, message = "Check the highlighted fields."): FormState {
  return { ok: false, message, errors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}
