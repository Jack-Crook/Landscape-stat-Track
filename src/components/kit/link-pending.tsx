"use client";

import { useLinkStatus } from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

/**
 * Feedback the instant a link is tapped, while the next page renders on the
 * server. Must sit inside the <Link> it reports on.
 */
export function PendingChevron() {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-label-3" aria-label="Loading" />
  ) : (
    <ChevronRight className="h-4 w-4 shrink-0 text-label-3" strokeWidth={2.5} aria-hidden />
  );
}

export function PendingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={`${className} shrink-0 animate-spin opacity-70`} aria-label="Loading" />;
}
