"use client";

import { useEffect } from "react";
import { Button } from "@/components/kit/ui";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="title-2">Something went wrong</h1>
      <p className="mt-2 text-label-2">That didn&apos;t load. Your data is safe. Try again, and if it keeps happening check your connection.</p>
      {error.digest && <p className="caption mt-2 text-label-3">Reference {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
