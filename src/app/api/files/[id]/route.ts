import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

/** Serves an uploaded receipt/photo to members of the org that owns it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const file = await db.query.files.findFirst({ where: and(eq(files.id, id), eq(files.orgId, current.orgId)) });
  if (!file) return new Response("Not found", { status: 404 });

  const safeName = (file.filename ?? "receipt").replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
