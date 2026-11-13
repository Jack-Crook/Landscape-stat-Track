/** Minimal RFC 4180 CSV writer. Excel-safe: BOM for UTF-8, CRLF line endings. */

function cell(v: unknown): string {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Guard against CSV/formula injection when opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
