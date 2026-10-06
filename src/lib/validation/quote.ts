// Mechanic money forms: quotes, change orders and invoice notes. Safe for client and server.
// Same structure as ./mechanic: raw `...FormValues` (input names), `parse...Form` (field errors
// keyed by input name, e.g. "parts.1.unitPrice") and a typed `...CommandSchema` that the domain
// functions re-validate. Prices are typed in dollars and become integer cents here; totals are
// never part of a form: src/server/pricing.ts computes them from the line items.
//
// Rules that need the request or the clock (earliest start at least an hour away and within 30
// days, in the request's time zone; allowed service modes) are checked by submitQuote.

import { z } from "zod";

import { QUOTE_SERVICE_MODES, type QuoteServiceMode } from "@/lib/domain";
import {
  FormReader,
  formRows,
  formText,
  isBlankRow,
  multiLineText,
  singleLineText,
  toFormResult,
  type FieldPath,
  type FormParseResult,
} from "./mechanic";

// ---------------------------------------------------------------------------------
// Limits (kept equal to src/server/config.ts and src/server/pricing.ts by a unit test)
// ---------------------------------------------------------------------------------

/** How long a quote stays valid, in hours (= QUOTE_TTL_HOURS_OPTIONS in src/server/config.ts). */
export const QUOTE_VALIDITY_HOURS = [24, 48, 72, 168] as const;
export type QuoteValidityHours = (typeof QUOTE_VALIDITY_HOURS)[number];

export const QUOTE_VALIDITY_OPTIONS: ReadonlyArray<{ hours: QuoteValidityHours; label: string }> = [
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

export const DEFAULT_QUOTE_VALIDITY_HOURS: QuoteValidityHours = 48;
export const DEFAULT_QUOTE_DURATION_MINUTES = 60;

export const QUOTE_LIMITS = {
  /** Largest unit price of one line (= MAX_UNIT_PRICE_CENTS in pricing.ts): $100,000. */
  maxUnitPriceCents: 10_000_000,
  /** Largest quantity of one part line (= MAX_ITEM_QUANTITY in pricing.ts). */
  maxQuantity: 100,
  maxPartRows: 15,
  maxTaxRows: 3,
  maxFeeRows: 5,
  lineDescriptionMax: 200,
  scopeMin: 3,
  scopeMax: 1000,
  exclusionsMax: 1000,
  notesMax: 1000,
  durationMinMinutes: 15,
  durationMaxMinutes: 1440,
  /** The offered start must be at least this far ahead... */
  minLeadMinutes: 60,
  /** ...and no further ahead than this. */
  maxAdvanceDays: 30,
} as const;

export const CHANGE_ORDER_LIMITS = {
  descriptionMin: 3,
  descriptionMax: 1000,
  reasonMin: 3,
  reasonMax: 1000,
  /** Largest labor, parts or tax amount of one change order: $100,000. */
  maxAmountCents: 10_000_000,
} as const;

export const INVOICE_NOTES_MAX = 1000;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/** True for a well-formed datetime-local value ("YYYY-MM-DDTHH:mm") with real date and time parts. */
export function isLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    year <= 2100 &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59
  );
}

// ---------------------------------------------------------------------------------
// Quote form
// ---------------------------------------------------------------------------------

/** A part row: inputs `parts.<i>.description`, `parts.<i>.quantity`, `parts.<i>.unitPrice`. */
export type QuotePartRowValues = { description: string; quantity: string; unitPrice: string };

/** A tax or fee row: inputs `taxes.<i>.description` / `taxes.<i>.amount` (and `fees.<i>...`). */
export type QuoteAmountRowValues = { description: string; amount: string };

export type QuoteFormValues = {
  /** Dollars, e.g. "120" or "120.50". */
  laborPrice: string;
  /** "yes" when the price includes parts, "no" when the customer pays for parts separately. */
  partsIncluded: string;
  parts: QuotePartRowValues[];
  taxes: QuoteAmountRowValues[];
  /** Other fees, e.g. "Shop supplies" or "Disposal fee". */
  fees: QuoteAmountRowValues[];
  /** datetime-local value "YYYY-MM-DDTHH:mm" in the REQUEST's time zone. */
  earliestStart: string;
  /** Estimated duration in minutes (15-1440). */
  durationMinutes: string;
  /** "mobile" | "garage" (must be one of the job's allowed modes). */
  serviceMode: string;
  /** What the price covers (required). */
  scope: string;
  exclusions: string;
  notes: string;
  /** "24" | "48" | "72" | "168" */
  validityHours: string;
};

export type QuotePartLine = { description: string; quantity: number; unitPriceCents: number };
export type QuoteAmountLine = { description: string; amountCents: number };

export type QuoteCommand = {
  laborCents: number;
  partsIncluded: boolean;
  /** Priced parts; empty when parts are not included. */
  parts: QuotePartLine[];
  taxes: QuoteAmountLine[];
  fees: QuoteAmountLine[];
  /** "YYYY-MM-DDTHH:mm", interpreted in the request's time zone by submitQuote. */
  earliestStartLocal: string;
  durationMinutes: number;
  serviceMode: QuoteServiceMode;
  scope: string;
  exclusions: string | null;
  notes: string | null;
  validityHours: QuoteValidityHours;
};

const PART_FIELDS = ["description", "quantity", "unitPrice"] as const;
const AMOUNT_FIELDS = ["description", "amount"] as const;

export function quoteFormValuesFromFormData(formData: FormData): QuoteFormValues {
  return {
    laborPrice: formText(formData, "laborPrice"),
    partsIncluded: formText(formData, "partsIncluded"),
    parts: formRows(formData, "parts", PART_FIELDS, QUOTE_LIMITS.maxPartRows * 2),
    taxes: formRows(formData, "taxes", AMOUNT_FIELDS, QUOTE_LIMITS.maxTaxRows * 2),
    fees: formRows(formData, "fees", AMOUNT_FIELDS, QUOTE_LIMITS.maxFeeRows * 2),
    earliestStart: formText(formData, "earliestStart"),
    durationMinutes: formText(formData, "durationMinutes"),
    serviceMode: formText(formData, "serviceMode"),
    scope: formText(formData, "scope"),
    exclusions: formText(formData, "exclusions"),
    notes: formText(formData, "notes"),
    validityHours: formText(formData, "validityHours"),
  };
}

const VALIDITY_VALUES = QUOTE_VALIDITY_HOURS.map(String) as readonly string[];

function readPartRows(r: FormReader, rows: readonly QuotePartRowValues[]): QuotePartLine[] | undefined {
  const lines: QuotePartLine[] = [];
  let ok = true;
  rows.forEach((row, index) => {
    // The form pre-fills quantity "1", so a row counts as unused when it has no description or price.
    if (isBlankRow(row, ["description", "unitPrice"])) return;
    const path = (field: string): FieldPath => ["parts", index, field];
    const description = r.text(path("description"), row.description, {
      name: "The part description",
      max: QUOTE_LIMITS.lineDescriptionMax,
      required: "Describe the part, like “Front brake pads”.",
    });
    // A part row with a price but no quantity means one of it.
    const quantity = r.integer(path("quantity"), row.quantity.trim() === "" ? "1" : row.quantity, {
      name: "Quantity",
      min: 1,
      max: QUOTE_LIMITS.maxQuantity,
      outOfRange: `Enter a quantity from 1 to ${QUOTE_LIMITS.maxQuantity}.`,
    });
    const unitPriceCents = r.cents(path("unitPrice"), row.unitPrice, {
      name: "The part price",
      required: "Enter the part's price, like 45.50.",
      allowZero: true,
      maxCents: QUOTE_LIMITS.maxUnitPriceCents,
    });
    if (description === undefined || quantity === undefined || unitPriceCents === undefined) {
      ok = false;
      return;
    }
    lines.push({ description, quantity, unitPriceCents });
  });
  if (lines.length > QUOTE_LIMITS.maxPartRows) {
    r.issue(["parts"], `List up to ${QUOTE_LIMITS.maxPartRows} parts. Combine small items into one line.`);
    return undefined;
  }
  return ok ? lines : undefined;
}

function readAmountRows(
  r: FormReader,
  group: "taxes" | "fees",
  rows: readonly QuoteAmountRowValues[],
): QuoteAmountLine[] | undefined {
  const isTax = group === "taxes";
  const max = isTax ? QUOTE_LIMITS.maxTaxRows : QUOTE_LIMITS.maxFeeRows;
  const lines: QuoteAmountLine[] = [];
  let ok = true;
  rows.forEach((row, index) => {
    if (isBlankRow(row, AMOUNT_FIELDS)) return;
    const path = (field: string): FieldPath => [group, index, field];
    const description = r.text(path("description"), row.description, {
      name: isTax ? "The tax description" : "The fee description",
      max: QUOTE_LIMITS.lineDescriptionMax,
      required: isTax ? "Describe the tax, like “Sales tax on parts (8.6%)”." : "Describe the fee, like “Shop supplies”.",
    });
    const amountCents = r.cents(path("amount"), row.amount, {
      name: isTax ? "The tax amount" : "The fee amount",
      required: isTax ? "Enter the tax amount, like 7.83." : "Enter the fee amount, like 12.00.",
      allowZero: false,
      maxCents: QUOTE_LIMITS.maxUnitPriceCents,
    });
    if (description === undefined || amountCents === undefined) {
      ok = false;
      return;
    }
    lines.push({ description, amountCents });
  });
  if (lines.length > max) {
    r.issue([group], isTax ? `Add up to ${max} tax lines.` : `Add up to ${max} fee lines.`);
    return undefined;
  }
  return ok ? lines : undefined;
}

function readQuote(r: FormReader, values: QuoteFormValues): QuoteCommand | undefined {
  const laborCents = r.cents(["laborPrice"], values.laborPrice, {
    name: "Labor price",
    required: "Enter your labor price, like 120 or 120.50.",
    allowZero: true,
    maxCents: QUOTE_LIMITS.maxUnitPriceCents,
  });
  const partsChoice = r.choice(
    ["partsIncluded"],
    values.partsIncluded,
    ["yes", "no"] as const,
    "Choose whether your price includes parts.",
  );
  const parts = readPartRows(r, values.parts);
  const taxes = readAmountRows(r, "taxes", values.taxes);
  const fees = readAmountRows(r, "fees", values.fees);

  if (partsChoice === "yes" && parts !== undefined && !parts.some((line) => line.unitPriceCents > 0)) {
    r.issue(["parts"], "You chose parts included, so list at least one part with its price.");
  }
  if (partsChoice === "no" && parts !== undefined && parts.length > 0) {
    r.issue(
      ["parts"],
      "You chose parts not included, so remove the part rows. Mention parts the customer must buy in Exclusions or Notes.",
    );
  }

  const earliestStartLocal = values.earliestStart.trim();
  if (!isLocalDateTime(earliestStartLocal)) {
    r.issue(["earliestStart"], "Choose the earliest date and time you can do the job.");
  }
  const durationMinutes = r.integer(["durationMinutes"], values.durationMinutes, {
    name: "Estimated duration",
    min: QUOTE_LIMITS.durationMinMinutes,
    max: QUOTE_LIMITS.durationMaxMinutes,
    required: "Enter how long the job will take, in minutes.",
    outOfRange: "Enter an estimated duration from 15 minutes to 24 hours (1440 minutes).",
  });
  const serviceMode = r.choice(
    ["serviceMode"],
    values.serviceMode,
    QUOTE_SERVICE_MODES,
    "Choose where you'll do the work: at the customer's location or at your garage.",
  );
  const scope = r.text(["scope"], values.scope, {
    name: "The scope",
    min: QUOTE_LIMITS.scopeMin,
    max: QUOTE_LIMITS.scopeMax,
    required: "Describe what your price covers.",
    multiline: true,
  });
  const exclusions = r.optionalText(["exclusions"], values.exclusions, {
    name: "Exclusions",
    max: QUOTE_LIMITS.exclusionsMax,
    multiline: true,
  });
  const notes = r.optionalText(["notes"], values.notes, { name: "Notes", max: QUOTE_LIMITS.notesMax, multiline: true });
  const validity = r.choice(["validityHours"], values.validityHours, VALIDITY_VALUES, "Choose how long your quote is valid.");

  if (
    laborCents !== undefined &&
    parts !== undefined &&
    taxes !== undefined &&
    fees !== undefined &&
    [laborCents, ...parts.map((line) => line.quantity * line.unitPriceCents), ...taxes.map((line) => line.amountCents), ...fees.map((line) => line.amountCents)].every((amount) => amount === 0)
  ) {
    r.issue(["laborPrice"], "Your quote total must be more than $0.");
  }

  if (
    r.failed ||
    laborCents === undefined ||
    partsChoice === undefined ||
    parts === undefined ||
    taxes === undefined ||
    fees === undefined ||
    durationMinutes === undefined ||
    serviceMode === undefined ||
    scope === undefined ||
    exclusions === undefined ||
    notes === undefined ||
    validity === undefined
  ) {
    return undefined;
  }
  return {
    laborCents,
    partsIncluded: partsChoice === "yes",
    parts,
    taxes,
    fees,
    earliestStartLocal,
    durationMinutes,
    serviceMode,
    scope,
    exclusions,
    notes,
    validityHours: Number(validity) as QuoteValidityHours,
  };
}

const cents = (max: number) => z.int().min(0).max(max);

const partLineSchema = z.object({
  description: singleLineText(QUOTE_LIMITS.lineDescriptionMax),
  quantity: z.int().min(1).max(QUOTE_LIMITS.maxQuantity),
  unitPriceCents: cents(QUOTE_LIMITS.maxUnitPriceCents),
});

const amountLineSchema = z.object({
  description: singleLineText(QUOTE_LIMITS.lineDescriptionMax),
  amountCents: cents(QUOTE_LIMITS.maxUnitPriceCents).min(1),
});

/** The typed quote terms submitQuote accepts (src/server/mechanic/quotes.ts). */
export const quoteCommandSchema = z
  .object({
    laborCents: cents(QUOTE_LIMITS.maxUnitPriceCents),
    partsIncluded: z.boolean(),
    parts: z.array(partLineSchema).max(QUOTE_LIMITS.maxPartRows),
    taxes: z.array(amountLineSchema).max(QUOTE_LIMITS.maxTaxRows),
    fees: z.array(amountLineSchema).max(QUOTE_LIMITS.maxFeeRows),
    earliestStartLocal: z.string().refine(isLocalDateTime, "Expected a local date-time YYYY-MM-DDTHH:mm."),
    durationMinutes: z.int().min(QUOTE_LIMITS.durationMinMinutes).max(QUOTE_LIMITS.durationMaxMinutes),
    serviceMode: z.enum(QUOTE_SERVICE_MODES),
    scope: multiLineText(QUOTE_LIMITS.scopeMax, QUOTE_LIMITS.scopeMin),
    exclusions: multiLineText(QUOTE_LIMITS.exclusionsMax).nullable(),
    notes: multiLineText(QUOTE_LIMITS.notesMax).nullable(),
    validityHours: z.literal(QUOTE_VALIDITY_HOURS),
  })
  .superRefine((quote, ctx) => {
    if (quote.partsIncluded && !quote.parts.some((line) => line.unitPriceCents > 0)) {
      ctx.addIssue({ code: "custom", message: "Parts are included, so at least one part needs a price.", path: ["parts"] });
    }
    if (!quote.partsIncluded && quote.parts.length > 0) {
      ctx.addIssue({ code: "custom", message: "Parts are not included, so no part lines are allowed.", path: ["parts"] });
    }
  });

export const quoteFormSchema = z
  .object({
    laborPrice: z.string().default(""),
    partsIncluded: z.string().default(""),
    parts: z.array(z.object({ description: z.string().default(""), quantity: z.string().default(""), unitPrice: z.string().default("") })).default([]),
    taxes: z.array(z.object({ description: z.string().default(""), amount: z.string().default("") })).default([]),
    fees: z.array(z.object({ description: z.string().default(""), amount: z.string().default("") })).default([]),
    earliestStart: z.string().default(""),
    durationMinutes: z.string().default(""),
    serviceMode: z.string().default(""),
    scope: z.string().default(""),
    exclusions: z.string().default(""),
    notes: z.string().default(""),
    validityHours: z.string().default(""),
  })
  .transform((values, ctx) => readQuote(FormReader.for(ctx), values) ?? z.NEVER)
  .pipe(quoteCommandSchema);

export function parseQuoteForm(values: QuoteFormValues): FormParseResult<QuoteCommand> {
  return toFormResult(quoteFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Change orders (extra work on a confirmed booking)
// ---------------------------------------------------------------------------------

export type ChangeOrderFormValues = {
  /** What extra work is proposed. */
  description: string;
  /** Why it is needed (what was found). */
  reason: string;
  /** Dollars; leave empty for $0. */
  laborPrice: string;
  partsPrice: string;
  taxAmount: string;
};

export type ChangeOrderCommand = {
  description: string;
  reason: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
};

export function changeOrderValuesFromFormData(formData: FormData): ChangeOrderFormValues {
  return {
    description: formText(formData, "description"),
    reason: formText(formData, "reason"),
    laborPrice: formText(formData, "laborPrice"),
    partsPrice: formText(formData, "partsPrice"),
    taxAmount: formText(formData, "taxAmount"),
  };
}

function readOptionalCents(r: FormReader, field: string, raw: string, name: string): number | undefined {
  return raw.trim() === ""
    ? 0
    : r.cents([field], raw, { name, allowZero: true, maxCents: CHANGE_ORDER_LIMITS.maxAmountCents });
}

function readChangeOrder(r: FormReader, values: ChangeOrderFormValues): ChangeOrderCommand | undefined {
  const description = r.text(["description"], values.description, {
    name: "The description",
    min: CHANGE_ORDER_LIMITS.descriptionMin,
    max: CHANGE_ORDER_LIMITS.descriptionMax,
    required: "Describe the extra work you propose.",
    multiline: true,
  });
  const reason = r.text(["reason"], values.reason, {
    name: "The reason",
    min: CHANGE_ORDER_LIMITS.reasonMin,
    max: CHANGE_ORDER_LIMITS.reasonMax,
    required: "Explain why the extra work is needed.",
    multiline: true,
  });
  const laborCents = readOptionalCents(r, "laborPrice", values.laborPrice, "Extra labor");
  const partsCents = readOptionalCents(r, "partsPrice", values.partsPrice, "Extra parts");
  const taxCents = readOptionalCents(r, "taxAmount", values.taxAmount, "Extra tax");
  if (laborCents === 0 && partsCents === 0 && taxCents === 0) {
    r.issue(["laborPrice"], "Enter the extra cost: labor, parts or tax (at least one above $0).");
  }
  if (
    r.failed ||
    description === undefined ||
    reason === undefined ||
    laborCents === undefined ||
    partsCents === undefined ||
    taxCents === undefined
  ) {
    return undefined;
  }
  return { description, reason, laborCents, partsCents, taxCents };
}

/** The typed change-order terms proposeChangeOrder accepts (strict integer cents). */
export const changeOrderCommandSchema = z
  .object({
    description: multiLineText(CHANGE_ORDER_LIMITS.descriptionMax, CHANGE_ORDER_LIMITS.descriptionMin),
    reason: multiLineText(CHANGE_ORDER_LIMITS.reasonMax, CHANGE_ORDER_LIMITS.reasonMin),
    laborCents: cents(CHANGE_ORDER_LIMITS.maxAmountCents),
    partsCents: cents(CHANGE_ORDER_LIMITS.maxAmountCents),
    taxCents: cents(CHANGE_ORDER_LIMITS.maxAmountCents),
  })
  .refine((order) => order.laborCents + order.partsCents + order.taxCents > 0, {
    message: "A change order must add more than $0.",
    path: ["laborCents"],
  });

export const changeOrderFormSchema = z
  .object({
    description: z.string().default(""),
    reason: z.string().default(""),
    laborPrice: z.string().default(""),
    partsPrice: z.string().default(""),
    taxAmount: z.string().default(""),
  })
  .transform((values, ctx) => readChangeOrder(FormReader.for(ctx), values) ?? z.NEVER)
  .pipe(changeOrderCommandSchema);

export function parseChangeOrderForm(values: ChangeOrderFormValues): FormParseResult<ChangeOrderCommand> {
  return toFormResult(changeOrderFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Invoice (confirmed bookings): optional notes; amounts always come from pricing.ts
// ---------------------------------------------------------------------------------

export type InvoiceFormValues = { notes: string };
export type InvoiceCommand = { notes: string | null };

export function invoiceValuesFromFormData(formData: FormData): InvoiceFormValues {
  return { notes: formText(formData, "notes") };
}

export const invoiceCommandSchema = z.object({ notes: multiLineText(INVOICE_NOTES_MAX).nullable() });

export const invoiceFormSchema = z
  .object({ notes: z.string().default("") })
  .transform((values, ctx) => {
    const notes = FormReader.for(ctx).optionalText(["notes"], values.notes, {
      name: "Invoice notes",
      max: INVOICE_NOTES_MAX,
      multiline: true,
    });
    return notes === undefined ? z.NEVER : { notes };
  })
  .pipe(invoiceCommandSchema);

export function parseInvoiceForm(values: InvoiceFormValues): FormParseResult<InvoiceCommand> {
  return toFormResult(invoiceFormSchema.safeParse(values));
}
