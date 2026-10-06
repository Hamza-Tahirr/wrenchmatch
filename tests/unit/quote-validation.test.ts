// Quote, change-order and invoice form validation (src/lib/validation/quote.ts) and the money
// helpers it shares with the mechanic forms.
import { describe, expect, it } from "vitest";

import {
  centsToDollarInput,
  formRows,
  parseDollarsToCents,
  type FormParseResult,
} from "@/lib/validation/mechanic";
import {
  changeOrderCommandSchema,
  isLocalDateTime,
  parseChangeOrderForm,
  parseInvoiceForm,
  parseQuoteForm,
  QUOTE_LIMITS,
  QUOTE_VALIDITY_HOURS,
  quoteCommandSchema,
  quoteFormValuesFromFormData,
  type QuoteCommand,
  type QuoteFormValues,
} from "@/lib/validation/quote";
import { QUOTE_TTL_HOURS_OPTIONS } from "@/server/config";
import { MAX_ITEM_QUANTITY, MAX_QUOTE_ITEMS, MAX_UNIT_PRICE_CENTS } from "@/server/pricing";

function values(overrides: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    laborPrice: "120",
    partsIncluded: "yes",
    parts: [{ description: "AGM battery, group 35", quantity: "1", unitPrice: "189.99" }],
    taxes: [],
    fees: [],
    earliestStart: "2026-10-07T09:00",
    durationMinutes: "60",
    serviceMode: "mobile",
    scope: "Test the charging system and replace the battery.",
    exclusions: "",
    notes: "",
    validityHours: "48",
    ...overrides,
  };
}

function errorsOf<T>(result: FormParseResult<T>): Record<string, string[]> {
  if (result.ok) throw new Error("expected validation errors");
  return result.fieldErrors;
}

function dataOf<T>(result: FormParseResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.fieldErrors)}`);
  return result.data;
}

describe("parseDollarsToCents", () => {
  it.each([
    ["120", 12_000],
    ["120.5", 12_050],
    ["120.50", 12_050],
    ["$1,250.05", 125_005],
    [" 45.55 ", 4_555],
    [".75", 75],
    ["0", 0],
    ["0.00", 0],
  ])("reads %j as %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(["", "-5", "12.345", "abc", "1,23", "1e3", "12.", "$", "1.2.3", "12 34"])("rejects %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });

  it("round-trips through centsToDollarInput", () => {
    expect(centsToDollarInput(12_050)).toBe("120.50");
    expect(centsToDollarInput(5)).toBe("0.05");
    expect(parseDollarsToCents(centsToDollarInput(987_654))).toBe(987_654);
    expect(() => centsToDollarInput(1.5)).toThrow(RangeError);
  });
});

describe("limits stay in step with the server", () => {
  it("matches config.ts and pricing.ts", () => {
    expect([...QUOTE_VALIDITY_HOURS]).toEqual([...QUOTE_TTL_HOURS_OPTIONS]);
    expect(QUOTE_LIMITS.maxUnitPriceCents).toBe(MAX_UNIT_PRICE_CENTS);
    expect(QUOTE_LIMITS.maxQuantity).toBe(MAX_ITEM_QUANTITY);
    // One labor line plus every allowed part, tax and fee row fits in a quote.
    expect(1 + QUOTE_LIMITS.maxPartRows + QUOTE_LIMITS.maxTaxRows + QUOTE_LIMITS.maxFeeRows).toBeLessThanOrEqual(
      MAX_QUOTE_ITEMS,
    );
  });
});

describe("parseQuoteForm", () => {
  it("turns a complete form into a typed command in integer cents", () => {
    const data = dataOf(
      parseQuoteForm(
        values({
          laborPrice: "$1,120.50",
          parts: [
            { description: " Front brake pads ", quantity: "2", unitPrice: "45.5" },
            { description: "", quantity: "", unitPrice: "" },
            { description: "Rotor", quantity: "", unitPrice: "89" },
          ],
          taxes: [{ description: "Sales tax on parts (8.6%)", amount: "15.48" }],
          fees: [{ description: "Disposal fee", amount: "5" }],
          exclusions: "  Calipers are not included. ",
          validityHours: "168",
        }),
      ),
    );
    const expected: QuoteCommand = {
      laborCents: 112_050,
      partsIncluded: true,
      parts: [
        { description: "Front brake pads", quantity: 2, unitPriceCents: 4_550 },
        { description: "Rotor", quantity: 1, unitPriceCents: 8_900 },
      ],
      taxes: [{ description: "Sales tax on parts (8.6%)", amountCents: 1_548 }],
      fees: [{ description: "Disposal fee", amountCents: 500 }],
      earliestStartLocal: "2026-10-07T09:00",
      durationMinutes: 60,
      serviceMode: "mobile",
      scope: "Test the charging system and replace the battery.",
      exclusions: "Calipers are not included.",
      notes: null,
      validityHours: 168,
    };
    expect(data).toEqual(expected);
  });

  it("reports every problem at once, keyed by input name", () => {
    const errors = errorsOf(
      parseQuoteForm({
        laborPrice: "",
        partsIncluded: "",
        parts: [],
        taxes: [],
        fees: [],
        earliestStart: "",
        durationMinutes: "",
        serviceMode: "",
        scope: "",
        exclusions: "",
        notes: "",
        validityHours: "",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["durationMinutes", "earliestStart", "laborPrice", "partsIncluded", "scope", "serviceMode", "validityHours"].sort(),
    );
    expect(errors.laborPrice[0]).toMatch(/labor price/i);
  });

  it("requires a priced part when parts are included, and no part rows when they are not", () => {
    expect(errorsOf(parseQuoteForm(values({ parts: [] }))).parts[0]).toMatch(/at least one part with its price/);
    expect(
      errorsOf(parseQuoteForm(values({ parts: [{ description: "Shop rag", quantity: "1", unitPrice: "0" }] }))).parts[0],
    ).toMatch(/at least one part/);
    expect(errorsOf(parseQuoteForm(values({ partsIncluded: "no" }))).parts[0]).toMatch(/remove the part rows/);

    const excluded = dataOf(parseQuoteForm(values({ partsIncluded: "no", parts: [{ description: "", quantity: "1", unitPrice: "" }] })));
    expect(excluded.partsIncluded).toBe(false);
    expect(excluded.parts).toEqual([]);
  });

  it("names the row and column of a bad part, tax or fee line", () => {
    const errors = errorsOf(
      parseQuoteForm(
        values({
          parts: [
            { description: "Battery", quantity: "1", unitPrice: "189.99" },
            { description: "Terminal", quantity: "0", unitPrice: "12.345" },
            { description: "", quantity: "1", unitPrice: "4" },
          ],
          taxes: [{ description: "Tax", amount: "0" }],
          fees: [{ description: "", amount: "3" }],
        }),
      ),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["fees.0.description", "parts.1.quantity", "parts.1.unitPrice", "parts.2.description", "taxes.0.amount"].sort(),
    );
    expect(errors["parts.1.unitPrice"][0]).toMatch(/dollars and cents/);
    expect(errors["taxes.0.amount"][0]).toMatch(/more than \$0/);
  });

  it("rejects a quote whose total would be $0", () => {
    const errors = errorsOf(parseQuoteForm(values({ laborPrice: "0", partsIncluded: "no", parts: [] })));
    expect(errors.laborPrice).toEqual(["Your quote total must be more than $0."]);
  });

  it("allows $0 labor when parts carry the price", () => {
    expect(dataOf(parseQuoteForm(values({ laborPrice: "0" }))).laborCents).toBe(0);
  });

  it.each([
    ["durationMinutes", "14"],
    ["durationMinutes", "1441"],
    ["durationMinutes", "1.5"],
    ["validityHours", "36"],
    ["serviceMode", "either"],
    ["earliestStart", "2026-02-30T10:00"],
    ["earliestStart", "2026-10-07 09:00"],
    ["laborPrice", "100001"],
    ["scope", "ok"],
  ] as const)("rejects %s = %j", (field, value) => {
    expect(errorsOf(parseQuoteForm(values({ [field]: value } as Partial<QuoteFormValues>)))[field]).toHaveLength(1);
  });

  it("limits the number of part rows", () => {
    const parts = Array.from({ length: QUOTE_LIMITS.maxPartRows + 1 }, (_, index) => ({
      description: `Part ${index}`,
      quantity: "1",
      unitPrice: "1",
    }));
    expect(errorsOf(parseQuoteForm(values({ parts }))).parts[0]).toMatch(/up to 15 parts/);
  });

  it("rejects control characters in line descriptions", () => {
    expect(
      errorsOf(parseQuoteForm(values({ parts: [{ description: "Pads\u0007", quantity: "1", unitPrice: "40" }] })))[
        "parts.0.description"
      ],
    ).toHaveLength(1);
  });
});

describe("quoteFormValuesFromFormData", () => {
  it("reads indexed rows in form order and keeps row numbers aligned with input names", () => {
    const formData = new FormData();
    formData.set("laborPrice", "120");
    formData.set("partsIncluded", "yes");
    formData.set("parts.2.description", "Rotor");
    formData.set("parts.2.unitPrice", "89");
    formData.set("parts.0.description", "Pads");
    formData.set("parts.0.quantity", "2");
    formData.set("parts.0.unitPrice", "45.50");
    formData.set("parts.99.description", "ignored: beyond the row limit");
    formData.set("fees.0.description", "Shop supplies");
    formData.set("fees.0.amount", "7");
    formData.set("earliestStart", "2026-10-07T09:00");
    formData.set("scope", "Replace pads and rotor.");
    formData.append("taxes.0.amount", new Blob(["not text"]));

    const read = quoteFormValuesFromFormData(formData);
    expect(read.parts).toEqual([
      { description: "Pads", quantity: "2", unitPrice: "45.50" },
      { description: "", quantity: "", unitPrice: "" },
      { description: "Rotor", quantity: "", unitPrice: "89" },
    ]);
    expect(read.taxes).toEqual([]);
    expect(read.fees).toEqual([{ description: "Shop supplies", amount: "7" }]);
    expect(read.notes).toBe("");

    const errors = errorsOf(parseQuoteForm(read));
    // Row 2 keeps its number: the error names the input the person filled in.
    expect(errors["parts.2.unitPrice"]).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["durationMinutes", "serviceMode", "validityHours"]);
  });

  it("formRows ignores unrelated keys", () => {
    const formData = new FormData();
    formData.set("parts.0.description", "Pads");
    formData.set("parts.0.colour", "red");
    formData.set("partsX.1.description", "nope");
    expect(formRows(formData, "parts", ["description"] as const, 5)).toEqual([{ description: "Pads" }]);
  });
});

describe("quoteCommandSchema (what submitQuote re-validates)", () => {
  const command = (): QuoteCommand => dataOf(parseQuoteForm(values()));

  it("accepts the output of the form schema", () => {
    expect(quoteCommandSchema.safeParse(command()).success).toBe(true);
  });

  it("rejects fractional or negative cents and inconsistent parts", () => {
    expect(quoteCommandSchema.safeParse({ ...command(), laborCents: 100.5 }).success).toBe(false);
    expect(quoteCommandSchema.safeParse({ ...command(), laborCents: -1 }).success).toBe(false);
    expect(quoteCommandSchema.safeParse({ ...command(), partsIncluded: false }).success).toBe(false);
    expect(quoteCommandSchema.safeParse({ ...command(), parts: [] }).success).toBe(false);
    expect(quoteCommandSchema.safeParse({ ...command(), validityHours: 12 }).success).toBe(false);
    expect(quoteCommandSchema.safeParse({ ...command(), earliestStartLocal: "2026-10-07T25:00" }).success).toBe(false);
  });

  it("isLocalDateTime accepts datetime-local values only", () => {
    expect(isLocalDateTime("2026-10-07T09:00")).toBe(true);
    expect(isLocalDateTime("2026-10-07T09:00:00")).toBe(true);
    expect(isLocalDateTime("2026-10-07T09:00Z")).toBe(false);
    expect(isLocalDateTime("2026-13-07T09:00")).toBe(false);
  });
});

describe("change orders and invoices", () => {
  it("reads optional amounts as $0 and needs a positive total", () => {
    expect(
      dataOf(
        parseChangeOrderForm({
          description: "Replace the cracked serpentine belt",
          reason: "Found cracks while replacing the battery.",
          laborPrice: "45",
          partsPrice: "32.40",
          taxAmount: "",
        }),
      ),
    ).toEqual({
      description: "Replace the cracked serpentine belt",
      reason: "Found cracks while replacing the battery.",
      laborCents: 4_500,
      partsCents: 3_240,
      taxCents: 0,
    });
    const errors = errorsOf(
      parseChangeOrderForm({ description: "ab", reason: "", laborPrice: "", partsPrice: "0", taxAmount: "-2" }),
    );
    expect(Object.keys(errors).sort()).toEqual(["description", "reason", "taxAmount"]);
    expect(
      errorsOf(parseChangeOrderForm({ description: "Belt", reason: "Worn", laborPrice: "0", partsPrice: "", taxAmount: "" }))
        .laborPrice,
    ).toHaveLength(1);
  });

  it("changeOrderCommandSchema accepts only whole cents", () => {
    const valid = { description: "Belt", reason: "Worn out", laborCents: 4_500, partsCents: 0, taxCents: 0 };
    expect(changeOrderCommandSchema.safeParse(valid).success).toBe(true);
    expect(changeOrderCommandSchema.safeParse({ ...valid, laborCents: 45.5 }).success).toBe(false);
    expect(changeOrderCommandSchema.safeParse({ ...valid, laborCents: "4500" }).success).toBe(false);
    expect(changeOrderCommandSchema.safeParse({ ...valid, laborCents: 0 }).success).toBe(false);
  });

  it("invoice notes are optional and bounded", () => {
    expect(dataOf(parseInvoiceForm({ notes: "   " }))).toEqual({ notes: null });
    expect(errorsOf(parseInvoiceForm({ notes: "x".repeat(1001) })).notes).toHaveLength(1);
  });
});
