import { describe, expect, it } from "vitest";
import { fromCents, parseAmountInput, sumCents, toCents } from "@/lib/money";
import {
  exclusiveFromInclusive,
  formatAbn,
  gstFromInclusive,
  gstOnExclusive,
  isValidAbn,
  lineItemTotals,
} from "@/lib/gst";

describe("money", () => {
  it("converts to and from cents without float drift", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
    expect(toCents("19.99")).toBe(1999);
    expect(toCents(null)).toBe(0);
    expect(toCents("")).toBe(0);
    expect(toCents("abc")).toBe(0);
    expect(fromCents(1999)).toBe("19.99");
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(-1234)).toBe("-12.34");
    expect(sumCents(["1.10", "2.20", null, 3.3])).toBe(660);
  });

  it("parses user-typed amounts", () => {
    expect(parseAmountInput("$1,234.50")).toBe(123450);
    expect(parseAmountInput("12")).toBe(1200);
    expect(parseAmountInput(" 7.5 ")).toBe(750);
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("12.3.4")).toBeNull();
    expect(parseAmountInput("ten")).toBeNull();
    expect(parseAmountInput(undefined)).toBeNull();
  });
});

describe("gst", () => {
  it("extracts GST from inclusive amounts (1/11)", () => {
    expect(gstFromInclusive(11000)).toBe(1000);
    expect(gstFromInclusive(18660)).toBe(1696);
    expect(gstFromInclusive(0)).toBe(0);
    expect(exclusiveFromInclusive(11000)).toBe(10000);
  });

  it("adds GST on exclusive amounts", () => {
    expect(gstOnExclusive(10000)).toBe(1000);
    expect(gstOnExclusive(12345)).toBe(1235); // rounds half up to the cent
  });

  it("totals invoice lines, rounding each line", () => {
    const t = lineItemTotals(
      [
        { quantity: 3, unitPrice: 33.333 },
        { quantity: 1, unitPrice: 100 },
      ],
      true
    );
    expect(t.subtotal).toBe(10000 + 10000); // 3 × 33.333 = 99.999 → $100.00
    expect(t.gst).toBe(2000);
    expect(t.total).toBe(22000);
  });

  it("charges no GST when not registered", () => {
    const t = lineItemTotals([{ quantity: 2, unitPrice: 50 }], false);
    expect(t).toEqual({ subtotal: 10000, gst: 0, total: 10000 });
  });

  it("validates ABNs with the ATO checksum", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true); // ATO's published example
    expect(isValidAbn("51824753557")).toBe(false);
    expect(isValidAbn("1234")).toBe(false);
    expect(isValidAbn(null)).toBe(false);
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
    expect(formatAbn("abc")).toBe("abc");
  });
});
