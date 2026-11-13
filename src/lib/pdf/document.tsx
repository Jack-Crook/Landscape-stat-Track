import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organisation } from "@/db/schema";
import { formatAbn } from "@/lib/gst";
import type { LineItem } from "@/lib/line-items";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const date = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" });
const money = (cents: number) => aud.format(cents / 100);

const GREEN = "#1d7334";
const INK = "#111111";
const MUTED = "#6b6b70";
const RULE = "#e3e3e8";

const s = StyleSheet.create({
  page: { padding: 44, fontSize: 10, color: INK, fontFamily: "Helvetica", lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: GREEN },
  small: { fontSize: 9, color: MUTED },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 2 },
  metaLabel: { color: MUTED, width: 70, textAlign: "right" },
  metaValue: { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" },
  billTo: { marginBottom: 22 },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  table: { borderTopWidth: 1, borderTopColor: INK },
  th: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: RULE, fontFamily: "Helvetica-Bold", fontSize: 9 },
  tr: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: RULE },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 80, textAlign: "right" },
  cAmt: { width: 90, textAlign: "right" },
  totals: { marginTop: 14, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1.5, borderTopColor: INK, fontFamily: "Helvetica-Bold", fontSize: 13 },
  box: { marginTop: 28, padding: 12, backgroundColor: "#f4f6f4", borderRadius: 6 },
  notes: { marginTop: 18 },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, fontSize: 8, color: MUTED, textAlign: "center" },
});

export type PdfInput = {
  kind: "invoice" | "quote";
  org: Organisation;
  number: string;
  issueDate: Date;
  dueDate?: Date | null;
  validUntil?: Date | null;
  client?: { name: string; address: string | null; email: string | null; phone: string | null } | null;
  title?: string;
  lineItems: LineItem[];
  subtotal: number;
  gst: number;
  total: number;
  notes?: string | null;
  paid?: boolean;
};

export function BusinessDocument(p: PdfInput) {
  const { org } = p;
  // A "tax invoice" (ATO wording) only when GST registered; otherwise just "Invoice".
  const title = p.kind === "quote" ? "Quote" : org.gstRegistered ? "Tax invoice" : "Invoice";
  return (
    <Document title={`${title} ${p.number}`} author={org.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={{ maxWidth: 260 }}>
            <Text style={s.brand}>{org.name}</Text>
            {org.abn && <Text style={s.small}>ABN {formatAbn(org.abn)}</Text>}
            {org.address && <Text style={s.small}>{org.address}</Text>}
            {[org.phone, org.email].filter(Boolean).length > 0 && <Text style={s.small}>{[org.phone, org.email].filter(Boolean).join("  ·  ")}</Text>}
          </View>
          <View>
            <Text style={s.docTitle}>{title}</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Number</Text>
              <Text style={s.metaValue}>{p.number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{date.format(p.issueDate)}</Text>
            </View>
            {p.dueDate && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Due</Text>
                <Text style={s.metaValue}>{date.format(p.dueDate)}</Text>
              </View>
            )}
            {p.validUntil && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Valid until</Text>
                <Text style={s.metaValue}>{date.format(p.validUntil)}</Text>
              </View>
            )}
          </View>
        </View>

        {p.client && (
          <View style={s.billTo}>
            <Text style={s.label}>{p.kind === "quote" ? "Prepared for" : "Bill to"}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{p.client.name}</Text>
            {p.client.address && <Text>{p.client.address}</Text>}
            {[p.client.phone, p.client.email].filter(Boolean).length > 0 && <Text style={s.small}>{[p.client.phone, p.client.email].filter(Boolean).join("  ·  ")}</Text>}
          </View>
        )}
        {p.title && <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 10 }}>{p.title}</Text>}

        <View style={s.table}>
          <View style={s.th}>
            <Text style={s.cDesc}>Description</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cUnit}>Unit price</Text>
            <Text style={s.cAmt}>Amount</Text>
          </View>
          {p.lineItems.map((l, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{l.description}</Text>
              <Text style={s.cQty}>{Number.isInteger(l.quantity) ? l.quantity : l.quantity.toFixed(2)}</Text>
              <Text style={s.cUnit}>{money(Math.round(l.unitPrice * 100))}</Text>
              <Text style={s.cAmt}>{money(Math.round(l.quantity * l.unitPrice * 100))}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={{ color: MUTED }}>Subtotal{org.gstRegistered ? " (ex GST)" : ""}</Text>
            <Text>{money(p.subtotal)}</Text>
          </View>
          {org.gstRegistered && (
            <View style={s.totalRow}>
              <Text style={{ color: MUTED }}>GST (10%)</Text>
              <Text>{money(p.gst)}</Text>
            </View>
          )}
          <View style={s.grand}>
            <Text>{p.kind === "quote" ? "Total" : p.paid ? "Paid" : "Amount due"}</Text>
            <Text>{money(p.total)}</Text>
          </View>
          {org.gstRegistered && <Text style={[s.small, { textAlign: "right" }]}>Total includes GST of {money(p.gst)}</Text>}
        </View>

        {p.kind === "invoice" && !p.paid && org.bankBsb && org.bankAccountNumber && (
          <View style={s.box}>
            <Text style={s.label}>How to pay</Text>
            <Text>
              Bank transfer to {org.bankAccountName ?? org.name} · BSB {org.bankBsb} · Account {org.bankAccountNumber}
            </Text>
            <Text style={s.small}>Please use {p.number} as the reference.</Text>
          </View>
        )}
        {p.kind === "invoice" && p.paid && (
          <View style={s.box}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: GREEN }}>Paid. Thank you!</Text>
          </View>
        )}

        {p.notes && (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text>{p.notes}</Text>
          </View>
        )}

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${org.name}${org.abn ? ` · ABN ${formatAbn(org.abn)}` : ""} · Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
