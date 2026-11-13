"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { buttonClasses } from "@/components/kit/ui";
import { shrinkImage } from "@/lib/client/shrink-image";
import { cn } from "@/lib/utils";
import { deletePhoto } from "../actions";

type Photo = { id: string; imageUrl: string; type: string; createdAt: string };
const LABELS: Record<string, string> = { before: "Before", progress: "During", after: "After" };

/** Before / during / after photos: proof of work, and portfolio shots for quoting. */
export function JobPhotos({ jobId, photos }: { jobId: string; photos: Photo[] }) {
  const router = useRouter();
  const [type, setType] = useState<"before" | "progress" | "after">(photos.some((p) => p.type === "before") ? "after" : "before");
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const upload = async (list: FileList) => {
    setError(null);
    setBusy((n) => n + list.length);
    for (const original of Array.from(list)) {
      const file = await shrinkImage(original);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: fd }).catch(() => null);
      if (!res?.ok) setError((await res?.json().catch(() => null))?.error ?? "Upload failed. Check your connection.");
      setBusy((n) => n - 1);
    }
    startTransition(() => router.refresh());
  };

  const groups = (["before", "progress", "after"] as const).map((t) => ({ t, items: photos.filter((p) => p.type === t) })).filter((g) => g.items.length);

  return (
    <div>
      {groups.length === 0 ? (
        <p className="mb-4 text-label-2">No photos yet. Before and after shots back you up if there&apos;s a dispute, and make great portfolio pics.</p>
      ) : (
        <div className="mb-4 space-y-4">
          {groups.map((g) => (
            <div key={g.t}>
              <div className="footnote mb-2 font-semibold text-label-2">{LABELS[g.t]}</div>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.items.map((p) => (
                  <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-fill">
                    <a href={p.imageUrl} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt={`${LABELS[p.type]} photo`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    </a>
                    <form action={deletePhoto} className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <input type="hidden" name="jobId" value={jobId} />
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" aria-label="Delete photo" className="material-strong rounded-full p-1.5 text-bad">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Photo type" className="inline-flex rounded-[10px] bg-fill p-0.5">
          {(["before", "progress", "after"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn("pressable rounded-[8px] px-3 py-1.5 text-[13px] font-semibold", type === t ? "bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-surface-2" : "text-label-2")}
            >
              {LABELS[t]}
            </button>
          ))}
        </div>
        <label className={buttonClasses("tinted", "md", "cursor-pointer")}>
          {busy > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy > 0 ? `Uploading ${busy}…` : "Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            data-testid="photo-input"
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="footnote mt-2 text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

