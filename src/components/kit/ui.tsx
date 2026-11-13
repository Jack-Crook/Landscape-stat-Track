import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HydrationMark } from "@/components/layout/HydrationMark";
import { PendingChevron } from "./link-pending";
import type { Tone } from "@/lib/constants";

// ─── Page scaffolding ─────────────────────────────────────────────────────────

export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("mx-auto w-full px-4 pb-28 pt-4 sm:px-6 md:pb-12 md:pt-8", wide ? "max-w-6xl" : "max-w-4xl", className)}>
      {children}
      {/* Inside the page's Suspense boundary, so it marks the page itself as interactive. */}
      <HydrationMark />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="pressable -ml-1 mb-2 inline-flex items-center gap-0.5 rounded-md px-1 text-[15px] font-medium text-tint-ink"
        >
          <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.5} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="large-title text-balance">{title}</h1>
          {subtitle && <p className="mt-1 text-label-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ─── Grouped sections (iOS inset grouped lists) ───────────────────────────────

export function Section({
  title,
  footer,
  action,
  children,
  className,
  flush,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding: for lists of rows. */
  flush?: boolean;
}) {
  return (
    <section className={cn("mb-7", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          {title && <h2 className="headline">{title}</h2>}
          {action && <div className="footnote text-tint-ink">{action}</div>}
        </div>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]",
          flush ? "" : "p-4 sm:p-5"
        )}
      >
        {children}
      </div>
      {footer && <p className="footnote mt-2 px-4 text-label-2">{footer}</p>}
    </section>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5", className)}>{children}</div>;
}

/** A row inside a flush Section. Separators inset from the leading edge, like iOS. */
export function Row({
  href,
  leading,
  title,
  subtitle,
  detail,
  trailing,
  className,
  chevron = !!href,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 [.group\/row:not(:last-child)_&]:border-b [.group\/row:not(:last-child)_&]:border-separator">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          {subtitle && <div className="footnote truncate text-label-2">{subtitle}</div>}
        </div>
        {detail && <div className="num shrink-0 text-right text-label-2">{detail}</div>}
        {trailing}
        {chevron && (href ? <PendingChevron /> : <ChevronRight className="h-4 w-4 shrink-0 text-label-3" strokeWidth={2.5} aria-hidden />)}
      </div>
    </>
  );
  const cls = cn("group/row flex items-center gap-3 pl-4", href && "row-press transition-colors", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function KeyValue({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="footnote text-label-2">{label}</div>
      <div className={cn("num truncate font-semibold", tone === "good" && "text-good", tone === "bad" && "text-bad")}>
        {value}
      </div>
    </div>
  );
}

// ─── Figures ──────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  delta,
  hint,
  href,
  trend,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  delta?: { text: string; good: boolean | null };
  hint?: React.ReactNode;
  href?: string;
  trend?: React.ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  const body = (
    <>
      <div className="footnote font-medium text-label-2">{label}</div>
      <div
        className={cn(
          "mt-1 font-semibold leading-tight tracking-[-0.02em]",
          typeof value === "string" && value.length > 16 ? "text-[1.125rem]" : "text-[1.625rem]",
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
          tone === "warn" && "text-warn"
        )}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "footnote mt-1 font-medium",
            delta.good === true && "text-good",
            delta.good === false && "text-bad",
            delta.good === null && "text-label-2"
          )}
        >
          {delta.text}
        </div>
      )}
      {hint && <div className="footnote mt-1 text-label-2">{hint}</div>}
      {trend && <div className="mt-3">{trend}</div>}
    </>
  );
  const cls = "block rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={cn(cls, "pressable")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-fill text-label-2",
  blue: "bg-[color-mix(in_oklab,var(--series-1)_16%,transparent)] text-[color-mix(in_oklab,var(--series-1)_80%,var(--label))]",
  green: "bg-tint-soft text-tint-ink",
  orange: "bg-[color-mix(in_oklab,var(--series-2)_16%,transparent)] text-[color-mix(in_oklab,var(--series-2)_75%,var(--label))]",
  red: "bg-[color-mix(in_oklab,var(--bad)_14%,transparent)] text-bad",
  purple: "bg-[color-mix(in_oklab,var(--series-7)_16%,transparent)] text-[color-mix(in_oklab,var(--series-7)_80%,var(--label))]",
  teal: "bg-[color-mix(in_oklab,var(--series-3)_16%,transparent)] text-[color-mix(in_oklab,var(--series-3)_60%,var(--label))]",
  yellow: "bg-[color-mix(in_oklab,var(--series-4)_20%,transparent)] text-[color-mix(in_oklab,var(--series-4)_55%,var(--label))]",
};

export function Pill({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("caption inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-semibold", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-label-3 [&_svg]:h-10 [&_svg]:w-10">{icon}</div>}
      <p className="headline">{title}</p>
      {body && <p className="footnote mt-1 max-w-sm text-label-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const color = { info: "var(--info)", warn: "var(--warn)", bad: "var(--bad)", good: "var(--good)" }[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl p-4"
      style={{ background: `color-mix(in oklab, ${color} 12%, var(--surface))` }}
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="footnote text-label-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ─── Buttons & links ──────────────────────────────────────────────────────────

type ButtonVariant = "filled" | "tinted" | "gray" | "plain" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClasses(variant: ButtonVariant = "filled", size: ButtonSize = "md", className?: string) {
  return cn(
    "pressable inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-[15px]",
    size === "lg" && "h-12 px-6 text-[17px]",
    variant === "filled" && "on-tint bg-tint text-white hover:brightness-105",
    variant === "tinted" && "bg-tint-soft text-tint-ink hover:brightness-95",
    variant === "gray" && "bg-fill text-label hover:bg-fill-2",
    variant === "plain" && "px-2 text-tint-ink hover:bg-fill",
    variant === "destructive" && "bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] text-bad hover:brightness-95",
    className
  );
}

export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  prefetch?: boolean;
  target?: string;
  download?: boolean | string;
}) {
  if (rest.download || rest.target) {
    return (
      <a href={href} className={buttonClasses(variant, size, className)} target={rest.target} download={rest.download}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} prefetch={rest.prefetch}>
      {children}
    </Link>
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

/** Segmented control made of links — for period pickers and filters (URL is the state). */
export function Segmented({
  options,
  value,
  className,
  label,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  className?: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-[10px] bg-fill p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "pressable whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors",
              active ? "bg-surface text-label shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-surface-2" : "text-label-2 hover:text-label"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string[] | string;
  children: React.ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="footnote block px-1 font-medium text-label-2">
        {label}
      </label>
      {children}
      {err ? (
        <p className="footnote px-1 text-bad" role="alert">
          {err}
        </p>
      ) : (
        hint && <p className="footnote px-1 text-label-3">{hint}</p>
      )}
    </div>
  );
}

export function Toggle({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked?: boolean;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="footnote block text-label-2">{description}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-fill-2 transition-colors duration-200 after:absolute after:left-[2px] after:top-[2px] after:h-[27px] after:w-[27px] after:rounded-full after:bg-white after:shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] after:transition-transform after:duration-200 peer-checked:bg-good peer-checked:after:translate-x-[20px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tint"
      />
    </label>
  );
}

export function Money({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  const abs = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(cents) / 100);
  const sign = cents < 0 ? "−" : signed && cents > 0 ? "+" : "";
  return <span className={cn("num", className)}>{`${sign}${abs}`}</span>;
}

export function IconBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white [&_svg]:h-[17px] [&_svg]:w-[17px]"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}
