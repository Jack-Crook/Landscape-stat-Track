import { asc, eq } from "drizzle-orm";
import { Star, Users } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { loadLedger } from "@/lib/data/ledger";
import { toCents } from "@/lib/money";
import { formatCents } from "@/lib/format";
import { EmptyState, LinkButton, Page, PageHeader, Row, Section } from "@/components/kit/ui";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const org = await getOrg();
  const { q } = await searchParams;
  const [rows, ledger] = await Promise.all([
    db.query.clients.findMany({ where: eq(clients.orgId, org.id), orderBy: asc(clients.name) }),
    loadLedger(org.id),
  ]);

  const paidBy = new Map<string, number>();
  const owedBy = new Map<string, number>();
  for (const inv of ledger.invoices) {
    if (!inv.clientId) continue;
    if (inv.status === "paid") paidBy.set(inv.clientId, (paidBy.get(inv.clientId) ?? 0) + toCents(inv.total));
    if (inv.status === "sent") owedBy.set(inv.clientId, (owedBy.get(inv.clientId) ?? 0) + toCents(inv.total));
  }

  const term = q?.trim().toLowerCase();
  const filtered = term
    ? rows.filter((c) => [c.name, c.email, c.phone, c.address].some((v) => v?.toLowerCase().includes(term)))
    : rows;

  return (
    <Page>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length === 1 ? "" : "s"}`}
        actions={<LinkButton href="/clients/new">Add client</LinkButton>}
      />
      {rows.length > 0 && (
        <form className="mb-5" role="search">
          <input name="q" defaultValue={q} placeholder="Search name, phone, address…" className="field" aria-label="Search clients" />
        </form>
      )}
      {filtered.length === 0 ? (
        <Section>
          <EmptyState
            icon={<Users />}
            title={term ? "No matching clients" : "No clients yet"}
            body={term ? "Try a different search." : "Add the people you do work for to track what each one is worth to you."}
            action={!term && <LinkButton href="/clients/new">Add client</LinkButton>}
          />
        </Section>
      ) : (
        <Section flush>
          {filtered.map((c) => {
            const owed = owedBy.get(c.id) ?? 0;
            return (
              <Row
                key={c.id}
                href={`/clients/${c.id}`}
                leading={
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fill font-semibold text-label-2">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                }
                title={
                  <span className="flex items-center gap-1.5">
                    {c.name}
                    {c.isPreferred && <Star className="h-3.5 w-3.5 fill-[var(--series-4)] text-[var(--series-4)]" aria-label="Preferred" />}
                  </span>
                }
                subtitle={[c.phone, c.address].filter(Boolean).join(" · ") || c.email || undefined}
                detail={
                  <div>
                    <div className="font-semibold text-label">{formatCents(paidBy.get(c.id) ?? 0)}</div>
                    {owed > 0 && <div className="footnote text-warn">{formatCents(owed)} owing</div>}
                  </div>
                }
              />
            );
          })}
        </Section>
      )}
    </Page>
  );
}
