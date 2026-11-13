import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { scannerMode } from "@/lib/env";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { ReceiptExtraction } from "./schema";
import { mockExtraction } from "./mock";

export const RECEIPT_MODEL = process.env.RECEIPT_MODEL || "claude-opus-5-5";

export const SUPPORTED_SCAN_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export class ScanError extends Error {
  constructor(
    message: string,
    readonly retryable = false
  ) {
    super(message);
  }
}

// Stable system prompt (no dates, ids or per-request text) so it caches.
const SYSTEM_PROMPT = `You read receipts, tax invoices and bills for an Australian landscaping business and return every detail as structured data.

Rules:
- Copy what is printed. Never invent a value: if a field isn't on the document or can't be read, use null and list it in "unreadable".
- Dates on Australian receipts are day-first (13/11/26 is 13 November 2026). Return YYYY-MM-DD.
- Include every purchased line, including fuel (quantity in litres), deposits, delivery fees and surcharges. Do not include subtotal/GST/total/payment/change lines as items.
- A multi-buy or member discount printed under a line belongs to that line's "discount", and "line_total" is the amount after it.
- "item_name" is what a tradie would search for later: short, generic, singular, sentence case ("Shovel", "Garden mulch", "Bobcat hire", "Unleaded petrol"). Keep brand, size and pack count out of it.
- Pick each line's category from this list (key: what belongs there):
${EXPENSE_CATEGORIES.map((c) => `  ${c.key}: ${c.hint}`).join("\n")}
- GST: Australian retail prices include GST, and the receipt usually says "Total includes GST $x". Items marked with a symbol such as * or # that the receipt's legend says are GST-free should have gst_free true. Fresh food, some medical items and exports are GST-free; hardware, fuel, plants and tools are not.
- Return ABNs as 11 digits with no spaces.
- Confidence is "low" if the photo is blurry, cropped, faded or partly unreadable.`;

/**
 * Sends a receipt image/PDF to Claude and returns the validated extraction.
 * In RECEIPT_SCANNER=mock mode returns a canned result (tests / demos).
 */
export async function extractReceipt(file: { data: Buffer; mimeType: string; filename?: string | null }) {
  const mode = scannerMode();
  if (mode === "mock") return mockExtraction(file.filename ?? "");
  if (mode === "off") {
    throw new ScanError(
      "Receipt scanning isn't set up yet. Add ANTHROPIC_API_KEY to the environment, or enter the receipt by hand."
    );
  }

  const base64 = file.data.toString("base64");
  const source: Anthropic.Beta.BetaContentBlockParam =
    file.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.mimeType as ImageType, data: base64 } };

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: RECEIPT_MODEL,
      max_tokens: 16000,
      // Server-side fallback: if the model declines (a false-positive safety
      // refusal), the API retries the same request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptExtraction) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: "Extract everything on this receipt." }],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new ScanError("The scanner is busy right now. Try again in a minute.", true);
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new ScanError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new ScanError("That file couldn't be read as a receipt. Try a clearer photo or a PDF.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ScanError("Couldn't reach the scanner. Check your connection and try again.", true);
    }
    if (err instanceof Anthropic.APIError) {
      throw new ScanError(`The scanner had a problem (${err.status ?? "unknown"}). Try again.`, true);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ScanError("The scanner couldn't process this file. Enter it by hand instead.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScanError("This receipt is too long to scan in one go. Try splitting it into pages.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScanError("The scan came back incomplete. Try again.", true);
  return parsed;
}
