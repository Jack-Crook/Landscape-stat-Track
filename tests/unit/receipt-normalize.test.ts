import { describe, expect, it } from "vitest";
import { normalizeExtraction, normalizeItemName } from "@/lib/receipts/normalize";
import { mockExtraction } from "@/lib/receipts/mock";
import { ReceiptExtraction } from "@/lib/receipts/schema";

describe("normalizeExtraction", () => {
  it("accepts the mock fixtures against the schema", () => {
    for (const f of ["bunnings.jpg", "fuel.jpg", "blank.jpg"]) {
      expect(() => ReceiptExtraction.parse(mockExtraction(f))).not.toThrow();
    }
  });

  it("turns a clean hardware receipt into items that add up", () => {
    const d = normalizeExtraction(mockExtraction("bunnings.jpg"));
    expect(d.vendor).toBe("Bunnings Warehouse");
    expect(d.totalCents).toBe(18660);
    expect(d.gstCents).toBe(1633);
    expect(d.subtotalCents).toBe(18660 - 1633);
    expect(d.items).toHaveLength(5);
    expect(d.items.reduce((s, i) => s + i.totalCents, 0)).toBe(18660);
    // Per-line GST sums to the printed GST.
    expect(d.items.reduce((s, i) => s + i.gstCents, 0)).toBe(1633);
    const food = d.items.find((i) => i.category === "food")!;
    expect(food.gstFree).toBe(true);
    expect(food.gstCents).toBe(0);
    expect(d.items[0].itemName).toBe("Shovel");
    expect(d.isTaxInvoice).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it("converts ex-GST trade invoice lines to inclusive", () => {
    const x = mockExtraction("bunnings.jpg");
    const d = normalizeExtraction({
      ...x,
      amounts_include_gst: false,
      line_items: [{ ...x.line_items[0], line_total: 100, gst_free: false }],
      gst_amount: 10,
      total: 110,
      discount_total: null,
    });
    expect(d.items[0].totalCents).toBe(11000);
    expect(d.items[0].gstCents).toBe(1000);
    expect(d.warnings).toEqual([]);
  });

  it("flags totals that don't reconcile and bad ABNs", () => {
    const x = mockExtraction("bunnings.jpg");
    const d = normalizeExtraction({ ...x, total: 250, vendor_abn: "12345678901", discount_total: null });
    expect(d.warnings.some((w) => w.includes("add up"))).toBe(true);
    expect(d.warnings.some((w) => w.includes("checksum"))).toBe(true);
  });

  it("warns when a large purchase has no ABN", () => {
    const x = mockExtraction("bunnings.jpg");
    const d = normalizeExtraction({ ...x, vendor_abn: null, document_type: "receipt" });
    expect(d.warnings.some((w) => w.includes("tax invoice"))).toBe(true);
  });

  it("copes with missing fields", () => {
    const d = normalizeExtraction(mockExtraction("blank.jpg"));
    expect(d.vendor).toBe("Unknown supplier");
    expect(d.date).toBeNull();
    expect(d.totalCents).toBe(0);
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it("warns on future dates and non-AUD", () => {
    const x = mockExtraction("fuel.jpg");
    const d = normalizeExtraction({ ...x, date: "2099-01-01", currency: "NZD" }, new Date(2026, 10, 13));
    expect(d.warnings.some((w) => w.includes("future"))).toBe(true);
    expect(d.warnings.some((w) => w.includes("NZD"))).toBe(true);
  });

  it("normalises item names for grouping", () => {
    expect(normalizeItemName("  SHOVEL ")).toBe("Shovel");
    expect(normalizeItemName("garden   MULCH")).toBe("Garden mulch");
    expect(normalizeItemName("")).toBe("Item");
  });
});
