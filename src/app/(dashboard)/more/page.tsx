import { Settings } from "lucide-react";
import { MORE_LINKS } from "@/components/layout/nav-config";
import { IconBadge, Page, PageHeader, Row, Section } from "@/components/kit/ui";

export const metadata = { title: "More" };

const COLORS = ["var(--series-1)", "var(--series-7)", "var(--series-3)", "var(--series-2)", "var(--series-5)", "var(--series-6)", "var(--series-4)", "var(--series-8)"];

export default function MorePage() {
  return (
    <Page>
      <PageHeader title="More" />
      <Section flush>
        {MORE_LINKS.map(({ href, label, icon: Icon }, i) => (
          <Row
            key={href}
            href={href}
            leading={
              <IconBadge color={COLORS[i % COLORS.length]}>
                <Icon />
              </IconBadge>
            }
            title={label}
          />
        ))}
      </Section>
      <Section flush>
        <Row
          href="/settings"
          leading={
            <IconBadge color="#8e8e93">
              <Settings />
            </IconBadge>
          }
          title="Settings"
        />
      </Section>
    </Page>
  );
}
