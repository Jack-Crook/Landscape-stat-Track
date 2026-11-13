import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Briefcase, Repeat } from "lucide-react";
import { db } from "@/db";
import { clients, jobs } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES, JOB_STATUSES } from "@/lib/constants";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { toCents } from "@/lib/money";
import { EmptyState, LinkButton, Page, PageHeader, Pill, Row, Section, Segmented } from "@/components/kit/ui";

export const metadata = { title: "Jobs" };

const FILTERS = [
  { value: "active", label: "Active" },
  ...JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] })),
  { value: "all", label: "All" },
];

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "active";
  const q = sp.q?.trim();

  const conds: SQL[] = [eq(jobs.orgId, org.id)];
  if (status === "active") conds.push(or(eq(jobs.status, "quoted"), eq(jobs.status, "in_progress"), eq(jobs.status, "completed"), eq(jobs.status, "invoiced"))!);
  else if (status !== "all") conds.push(eq(jobs.status, status as (typeof JOB_STATUSES)[number]));
  if (q) conds.push(or(ilike(jobs.name, `%${q}%`), ilike(jobs.siteAddress, `%${q}%`), ilike(clients.name, `%${q}%`), ilike(jobs.category, `%${q}%`))!);

  const rows = await db
    .select({ job: jobs, clientName: clients.name })
    .from(jobs)
    .leftJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(...conds))
    .orderBy(desc(jobs.startDate), desc(jobs.createdAt))
    .limit(300);

  const href = (s: string) => `/jobs?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <Page>
      <PageHeader title="Jobs" actions={<LinkButton href="/jobs/new">New job</LinkButton>} />
      <div className="mb-5 space-y-3">
        <Segmented label="Filter jobs by status" value={status} options={FILTERS.map((f) => ({ ...f, href: href(f.value) }))} />
        <form role="search">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search jobs, clients, addresses…" className="field" aria-label="Search jobs" />
        </form>
      </div>

      {rows.length === 0 ? (
        <Section>
          <EmptyState
            icon={<Briefcase />}
            title={q ? "No matching jobs" : status === "active" ? "No active jobs" : "Nothing here"}
            body="Create a job, or convert an accepted quote, to start tracking costs and profit."
            action={<LinkButton href="/jobs/new">New job</LinkButton>}
          />
        </Section>
      ) : (
        <Section flush>
          {rows.map(({ job, clientName }) => {
            const price = job.quotedPrice ? toCents(job.quotedPrice) : null;
            const profit = job.profit != null ? toCents(job.profit) : null;
            const revenue = price == null ? null : org.gstRegistered ? price - Math.round(price / 11) : price;
            const margin = profit != null && revenue ? (profit / revenue) * 100 : null;
            return (
              <Row
                key={job.id}
                href={`/jobs/${job.id}`}
                title={
                  <span className="flex items-center gap-1.5">
                    {job.name}
                    {job.isRecurring && <Repeat className="h-3.5 w-3.5 text-label-3" aria-label="Recurring" />}
                  </span>
                }
                subtitle={[clientName, job.category, formatDate(job.startDate ?? job.createdAt)].filter(Boolean).join(" · ")}
                detail={
                  price != null ? (
                    <div>
                      <div className="font-semibold text-label">{formatCents(price)}</div>
                      {profit != null && (
                        <div className={`footnote ${profit < 0 ? "text-bad" : "text-label-2"}`}>
                          {formatCents(profit)} profit{margin != null && ` · ${formatPercent(margin)}`}
                        </div>
                      )}
                    </div>
                  ) : undefined
                }
                trailing={<Pill tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Pill>}
              />
            );
          })}
        </Section>
      )}
    </Page>
  );
}
