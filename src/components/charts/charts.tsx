"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Small SVG chart set following the dataviz rules: thin marks (bars ≤ 24px with
 * 4px rounded data-ends, 2px lines), recessive hairline grid, one y-axis, legend
 * for 2+ series, hover tooltip on every chart, and a hidden table for screen
 * readers. Colours come from the validated --series-N tokens in globals.css.
 */

export type Series = { key: string; name: string; color: string };

const AUD0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const AUDC = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", notation: "compact", maximumFractionDigits: 1 });

/** Cents → axis label: full under $10k, compact above. */
const AUD2 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export function axisMoney(cents: number, maxAbs: number) {
  if (maxAbs < 2_000) return AUD2.format(cents / 100); // small prices keep their cents
  return maxAbs >= 1_000_000 ? AUDC.format(cents / 100) : AUD0.format(cents / 100);
}
export function tipMoney(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

/** Value formats by name: functions can't be passed from server to client components. */
export type ValueFormat = "money" | "percent" | "number";
function formatter(f: ValueFormat | undefined): (v: number) => string {
  if (f === "percent") return (v) => `${v.toFixed(0)}%`;
  if (f === "number") return (v) => v.toLocaleString("en-AU");
  return tipMoney;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) max = min + 1;
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="footnote mb-3 flex flex-wrap gap-x-4 gap-y-1 text-label-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return (
    <div
      role="presentation"
      className="material-strong pointer-events-none absolute z-10 min-w-[120px] -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 text-[12px] shadow-[var(--shadow-float)]"
      style={{ left, top: Math.max(y - 8, 8) }}
    >
      {children}
    </div>
  );
}

function SrTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rounded-top bar path (4px data-end, square at the baseline). Handles negatives. */
function barPath(x: number, w: number, y0: number, y1: number, r = 4) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  if (y1 <= y0) {
    // positive: rounded at the top
    return `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${y0} Z`;
  }
  const bottom = top + h;
  return `M${x},${y0} V${bottom - rr} Q${x},${bottom} ${x + rr},${bottom} H${x + w - rr} Q${x + w},${bottom} ${x + w},${bottom - rr} V${y0} Z`;
}

// ─── Column chart (grouped) ───────────────────────────────────────────────────

export function ColumnChart({
  data,
  series,
  height = 220,
  caption,
}: {
  data: Array<{ label: string; values: Record<string, number> }>;
  series: Series[];
  height?: number;
  caption: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 8, right: 4, bottom: 24, left: 52 };

  const { ticks, min, max } = useMemo(() => {
    const all = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
    const t = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    return { ticks: t, min: t[0], max: t[t.length - 1] };
  }, [data, series]);

  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const band = data.length ? innerW / data.length : 0;
  const groupGap = 2;
  const barW = Math.max(2, Math.min(24, (band * 0.7 - groupGap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + groupGap * (series.length - 1);
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  const showEvery = band < 34 ? Math.ceil(34 / Math.max(band, 1)) : 1;

  return (
    <figure className="m-0">
      <Legend series={series} />
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={caption}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--label-3)] text-[11px]">
                  {axisMoney(t, maxAbs)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = pad.left + band * i + (band - groupW) / 2;
              return (
                <g key={d.label}>
                  {hover === i && <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="var(--fill)" rx={6} />}
                  {series.map((s, j) => (
                    <path key={s.key} d={barPath(gx + j * (barW + groupGap), barW, y(0), y(d.values[s.key] ?? 0))} fill={s.color} />
                  ))}
                  {i % showEvery === 0 && (
                    <text x={pad.left + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-[var(--label-3)] text-[11px]">
                      {d.label}
                    </text>
                  )}
                  <rect
                    x={pad.left + band * i}
                    y={0}
                    width={band}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
            <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--separator)" strokeWidth={1} />
          </svg>
        )}
        {hover != null && data[hover] && (
          <Tooltip x={pad.left + band * hover + band / 2} y={pad.top + 4} width={width}>
            <div className="mb-1 font-semibold">{data[hover].label}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-label-2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="num font-semibold">{tipMoney(data[hover].values[s.key] ?? 0)}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
      <SrTable
        caption={caption}
        headers={["Period", ...series.map((s) => s.name)]}
        rows={data.map((d) => [d.label, ...series.map((s) => tipMoney(d.values[s.key] ?? 0))])}
      />
    </figure>
  );
}

// ─── Line chart ───────────────────────────────────────────────────────────────

export function LineChart({
  data,
  series,
  height = 200,
  caption,
  valueFormat,
  area = true,
}: {
  data: Array<{ label: string; values: Record<string, number | null> }>;
  series: Series[];
  height?: number;
  caption: string;
  valueFormat?: ValueFormat;
  area?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const pad = { top: 12, right: 12, bottom: 24, left: 52 };

  const { ticks, min, max } = useMemo(() => {
    const all = data.flatMap((d) => series.map((s) => d.values[s.key])).filter((v): v is number => v != null);
    if (all.length === 0) return { ticks: [0, 1], min: 0, max: 1 };
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const t = niceTicks(Math.min(0, lo), hi);
    return { ticks: t, min: t[0], max: t[t.length - 1] };
  }, [data, series]);

  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  const format = formatter(valueFormat);
  const fmtAxis = valueFormat && valueFormat !== "money" ? (v: number) => format(v) : axisMoney;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56))));

  const pathFor = (key: string) => {
    let d = "";
    let started = false;
    data.forEach((p, i) => {
      const v = p.values[key];
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${x(i)},${y(v)} `;
      started = true;
    });
    return d.trim();
  };

  const onMove = (clientX: number) => {
    const el = ref.current;
    if (!el || data.length === 0) return;
    const rel = clientX - el.getBoundingClientRect().left - pad.left;
    const i = data.length <= 1 ? 0 : Math.round((rel / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <figure className="m-0">
      <Legend series={series} />
      <div
        ref={ref}
        className="relative touch-pan-y"
        style={{ height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onMouseLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={caption}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--label-3)] text-[11px]">
                  {fmtAxis(t, maxAbs)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % labelEvery === 0 ? (
                <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--label-3)] text-[11px]">
                  {d.label}
                </text>
              ) : null
            )}
            {series.map((s) => {
              const p = pathFor(s.key);
              const pts = data.map((d, i) => ({ i, v: d.values[s.key] })).filter((p): p is { i: number; v: number } => p.v != null);
              return (
                <g key={s.key}>
                  {area && series.length === 1 && pts.length > 1 && (
                    <path
                      d={`${p} L${x(pts[pts.length - 1].i)},${y(Math.max(min, 0))} L${x(pts[0].i)},${y(Math.max(min, 0))} Z`}
                      fill={`url(#${gid}-${s.key})`}
                    />
                  )}
                  <path d={p} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.length > 0 && (
                    <circle cx={x(pts[pts.length - 1].i)} cy={y(pts[pts.length - 1].v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  )}
                  {pts.length <= 12 &&
                    pts.slice(0, -1).map((pt) => <circle key={pt.i} cx={x(pt.i)} cy={y(pt.v)} r={3} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
                </g>
              );
            })}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--label-3)" strokeWidth={1} />
                {series.map((s) => {
                  const v = data[hover]?.values[s.key];
                  return v == null ? null : (
                    <circle key={s.key} cx={x(hover)} cy={y(v)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  );
                })}
              </g>
            )}
          </svg>
        )}
        {hover != null && data[hover] && (
          <Tooltip x={x(hover)} y={pad.top} width={width}>
            <div className="mb-1 font-semibold">{data[hover].label}</div>
            {series.map((s) => {
              const v = data[hover].values[s.key];
              return (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-label-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="num font-semibold">{v == null ? "—" : format(v)}</span>
                </div>
              );
            })}
          </Tooltip>
        )}
      </div>
      <SrTable
        caption={caption}
        headers={["Point", ...series.map((s) => s.name)]}
        rows={data.map((d) => [d.label, ...series.map((s) => (d.values[s.key] == null ? "—" : format(d.values[s.key]!)))])}
      />
    </figure>
  );
}

// ─── Horizontal bar list ──────────────────────────────────────────────────────

export function BarList({
  items,
  color = "var(--series-1)",
  valueFormat,
  caption,
}: {
  items: Array<{ key: string; label: React.ReactNode; value: number; sub?: React.ReactNode; href?: string }>;
  color?: string;
  valueFormat?: ValueFormat;
  caption: string;
}) {
  const format = formatter(valueFormat);
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={caption} className="space-y-3">
      {items.map((it) => {
        const pct = Math.max(1.5, (it.value / max) * 100);
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{it.label}</span>
              <span className="num shrink-0 font-semibold">{format(it.value)}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-fill">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            {it.sub && <div className="footnote mt-1 text-label-2">{it.sub}</div>}
          </>
        );
        return (
          <li key={it.key}>
            {it.href ? (
              <a href={it.href} className="pressable -mx-2 block rounded-xl px-2 py-1 hover:bg-fill">
                {content}
              </a>
            ) : (
              <div className="py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Segmented bar (parts of a whole) ─────────────────────────────────────────

export function SegmentedBar({
  parts,
  caption,
  valueFormat,
}: {
  parts: Array<{ key: string; name: string; value: number; color: string }>;
  caption: string;
  valueFormat?: ValueFormat;
}) {
  const format = formatter(valueFormat);
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  if (total <= 0) return <p className="footnote text-label-2">Nothing to show yet.</p>;
  return (
    <figure className="m-0">
      <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={`${caption}: ${shown.map((p) => `${p.name} ${format(p.value)}`).join(", ")}`}>
        {shown.map((p) => {
          const pct = (p.value / total) * 100;
          return (
            <div
              key={p.key}
              className={cn("flex items-center overflow-hidden rounded-[4px] px-2 text-[11px] font-semibold text-white transition-opacity", hover && hover !== p.key && "opacity-50")}
              style={{ width: `${pct}%`, background: p.color }}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              title={`${p.name}: ${format(p.value)} (${pct.toFixed(0)}%)`}
            >
              {pct >= 12 && <span className="truncate">{pct.toFixed(0)}%</span>}
            </div>
          );
        })}
      </div>
      <ul className="footnote mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3" onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            <span className="flex items-center gap-2 text-label-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num font-semibold">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({ values, color = "var(--label-3)", accent = "var(--tint)", height = 28 }: { values: number[]; color?: string; accent?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (v: number) => 3 + (height - 6) * (1 - (v - min) / (max - min || 1));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <div ref={ref} style={{ height }} aria-hidden>
      {width > 0 && (
        <svg width={width} height={height}>
          <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={accent} />
        </svg>
      )}
    </div>
  );
}
