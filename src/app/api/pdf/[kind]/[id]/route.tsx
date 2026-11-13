import { and, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { invoices, organisations, quotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { parseStoredLines } from "@/lib/line-items";
import { toCents } from "@/lib/money";
import { BusinessDocument, type PdfInput } from "@/lib/pdf/document";

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { kind, id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, current.orgId) });
  if (!org) return new Response("Not found", { status: 404 });

  let input: PdfInput;
  if (kind === "invoice") {
    const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, org.id)), with: { client: true } });
    if (!inv) return new Response("Not found", { status: 404 });
    input = {
      kind: "invoice",
      org,
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      client: inv.client,
      lineItems: inv.lineItems,
      subtotal: toCents(inv.subtotal),
      gst: toCents(inv.gstAmount),
      total: toCents(inv.total),
      notes: inv.notes,
      paid: inv.status === "paid",
    };
  } else if (kind === "quote") {
    const q = await db.query.quotes.findFirst({ where: and(eq(quotes.id, id), eq(quotes.orgId, org.id)), with: { client: true } });
    if (!q) return new Response("Not found", { status: 404 });
    input = {
      kind: "quote",
      org,
      number: q.number ?? "Quote",
      title: q.title,
      issueDate: q.createdAt,
      validUntil: q.validUntil,
      client: q.client,
      lineItems: parseStoredLines(q.lineItems),
      subtotal: toCents(q.subtotal),
      gst: toCents(q.gstAmount),
      total: toCents(q.total),
      notes: q.notes,
    };
  } else {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await renderToBuffer(<BusinessDocument {...input} />);
  const filename = `${input.kind === "quote" ? "Quote" : "Invoice"}-${input.number}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
