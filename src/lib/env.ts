/**
 * Runtime mode switches.
 *
 * AUTH_MODE=dev  → no Clerk: every request is the local "Demo" user. For local
 *                  development and the e2e suite only. Refused on Vercel production.
 * RECEIPT_SCANNER=mock → receipts are "scanned" with a canned result instead of
 *                  calling Claude (tests, demos without an API key).
 */

export function isDevAuth(): boolean {
  if (process.env.AUTH_MODE !== "dev") return false;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("AUTH_MODE=dev is not allowed in production. Remove it from the environment.");
  }
  return true;
}

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function clerkEnabled(): boolean {
  return !isDevAuth() && isClerkConfigured();
}

export type ScannerMode = "claude" | "mock" | "off";

export function scannerMode(): ScannerMode {
  if (process.env.RECEIPT_SCANNER === "mock" && process.env.VERCEL_ENV !== "production") return "mock";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  return "off";
}
