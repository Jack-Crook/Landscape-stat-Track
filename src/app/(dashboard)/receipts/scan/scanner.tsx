"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, FileUp, Loader2, RotateCcw, XCircle } from "lucide-react";
import { buttonClasses } from "@/components/kit/ui";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shrinkImage } from "@/lib/client/shrink-image";

type Item = {
  key: string;
  file: File;
  status: "queued" | "shrinking" | "reading" | "done" | "error";
  preview?: string;
  result?: { id: string; vendor?: string; total?: number; items?: number; warnings?: string[]; manual?: boolean; duplicateOf?: string | null };
  error?: string;
  retryable?: boolean;
};

export function Scanner({ jobId, jobName, scannerReady }: { jobId?: string; jobName?: string; scannerReady: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const queue = useRef<Item[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const process = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    // One at a time keeps memory low on phones and avoids rate limits.
    while (queue.current.length) {
      const item = queue.current.shift()!;
      patch(item.key, { status: "shrinking" });
      const upload = await shrinkImage(item.file);
      patch(item.key, { status: "reading" });
      const fd = new FormData();
      fd.append("file", upload);
      if (jobId) fd.append("jobId", jobId);
      try {
        const res = await fetch("/api/receipts/scan", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) patch(item.key, { status: "error", error: body.error ?? `Upload failed (${res.status})`, retryable: !!body.retryable });
        else patch(item.key, { status: "done", result: body });
      } catch {
        patch(item.key, { status: "error", error: "No connection. Check your signal and retry.", retryable: true });
      }
    }
    busy.current = false;
  }, [jobId]);

  const add = (files: FileList | File[]) => {
    const next: Item[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "queued",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setItems((list) => [...next, ...list]);
    queue.current.push(...next);
    void process();
  };

  // A photo picked before the page finished loading fires `change` before React
  // is listening. Pick those files up once we are.
  useEffect(() => {
    for (const input of [cameraRef.current, filesRef.current]) {
      if (input?.files?.length) {
        add(input.files);
        input.value = "";
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = (item: Item) => {
    patch(item.key, { status: "queued", error: undefined });
    queue.current.push(item);
    void process();
  };

  const done = items.filter((i) => i.status === "done");
  const working = items.some((i) => ["queued", "shrinking", "reading"].includes(i.status));

  return (
    <div>
      {jobName && (
        <p className="mb-4 rounded-xl bg-tint-soft px-4 py-3 text-tint-ink">
          Receipts will be linked to <strong>{jobName}</strong>.
        </p>
      )}
      {!scannerReady && (
        <p className="mb-4 rounded-xl bg-[color-mix(in_oklab,var(--warn)_14%,var(--surface))] px-4 py-3 text-[14px]">
          Automatic reading isn&apos;t switched on (no ANTHROPIC_API_KEY). Photos are still saved and you can type the details in next to them.
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) add(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-tint bg-tint-soft" : "border-separator bg-surface"
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-tint-soft text-tint-ink">
          <Camera className="h-8 w-8" />
        </div>
        <div>
          <p className="headline">Snap or upload receipts</p>
          <p className="footnote mt-1 max-w-sm text-label-2">
            Claude reads every line (items, GST, ABN, totals) so you can see later exactly what you spent on shovels, mulch or fuel. Add as many as you like.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <label className={buttonClasses("filled", "lg", "cursor-pointer")}>
            <Camera className="h-5 w-5" />
            Take photo
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
              data-testid="camera-input"
            />
          </label>
          <label className={buttonClasses("gray", "lg", "cursor-pointer")}>
            <FileUp className="h-5 w-5" />
            Choose files
            <input
              ref={filesRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
              data-testid="file-input"
            />
          </label>
        </div>
        <p className="caption text-label-3">JPEG, PNG, HEIC or PDF · up to 8 MB each</p>
      </div>

      {items.length > 0 && (
        <ul className="mt-6 space-y-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-fill">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {i.preview ? <img src={i.preview} alt="" className="h-full w-full object-cover" /> : <FileUp className="m-4 h-6 w-6 text-label-3" />}
              </div>
              <div className="min-w-0 flex-1">
                {i.status === "done" && i.result ? (
                  <>
                    <p className="truncate font-semibold">
                      {i.result.manual ? "Saved: needs typing in" : `${i.result.vendor} · ${formatCents(i.result.total ?? 0)}`}
                    </p>
                    <p className="footnote truncate text-label-2">
                      {i.result.manual
                        ? i.result.warnings?.[0]
                        : `${i.result.items} item${i.result.items === 1 ? "" : "s"} found${i.result.warnings?.length ? ` · ${i.result.warnings.length} to check` : ""}`}
                    </p>
                  </>
                ) : i.status === "error" ? (
                  <>
                    <p className="truncate font-semibold">{i.file.name}</p>
                    <p className="footnote text-bad">{i.error}</p>
                  </>
                ) : (
                  <>
                    <p className="truncate font-semibold">{i.file.name}</p>
                    <p className="footnote text-label-2">
                      {i.status === "queued" ? "Waiting…" : i.status === "shrinking" ? "Preparing photo…" : "Reading receipt…"}
                    </p>
                  </>
                )}
              </div>
              {i.status === "done" && i.result ? (
                <Link href={`/receipts/${i.result.id}`} className={buttonClasses(i.result.warnings?.length ? "tinted" : "gray", "sm")}>
                  {i.result.warnings?.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Review
                </Link>
              ) : i.status === "error" ? (
                i.retryable ? (
                  <button type="button" onClick={() => retry(i)} className={buttonClasses("gray", "sm")}>
                    <RotateCcw className="h-4 w-4" /> Retry
                  </button>
                ) : (
                  <XCircle className="h-5 w-5 text-bad" aria-hidden />
                )
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-label-3" aria-label="Working" />
              )}
            </li>
          ))}
        </ul>
      )}

      {done.length > 1 && !working && (
        <div className="mt-6 flex justify-center">
          <Link href="/receipts?view=review" className={buttonClasses("filled", "lg")}>
            Review {done.length} receipts
          </Link>
        </div>
      )}
    </div>
  );
}
