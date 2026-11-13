import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { files, jobPhotos, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const TYPES = ["before", "progress", "after"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

/** POST multipart { file, type: before|progress|after } → adds a photo to the job. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, id), eq(jobs.orgId, current.orgId)), columns: { id: true } });
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const type = String(form?.get("type") ?? "progress");
  if (!(file instanceof File)) return Response.json({ error: "No photo uploaded." }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return Response.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That photo is over 8 MB." }, { status: 413 });
  if (!(TYPES as readonly string[]).includes(type)) return Response.json({ error: "Unknown photo type." }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer());
  const photo = await db.transaction(async (tx) => {
    const [f] = await tx
      .insert(files)
      .values({ orgId: current.orgId, filename: file.name || "photo.jpg", mimeType: file.type, size: data.length, data })
      .returning({ id: files.id });
    const [p] = await tx.insert(jobPhotos).values({ jobId: job.id, fileId: f.id, imageUrl: `/api/files/${f.id}`, type }).returning();
    return p;
  });
  revalidatePath(`/jobs/${job.id}`);
  return Response.json({ id: photo.id, url: photo.imageUrl });
}
