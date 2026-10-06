// Repair-request form validation, shared by the browser form and the server (Zod 4).
//
// One schema serves both sides: its preprocessors accept raw FormData strings ("98,000",
// "yes") and already-typed values (98000, true), so the server re-validates the typed input
// with the same rules (parse(parse(x)) is parse(x)). Rules that need the database or the
// ZIP's time zone (category enabled, pilot ZIP, preferred date window) run on the server;
// `preferredDateError` lets the browser pre-check the date against its own "today".
//
// The first section holds small field helpers that booking.ts and support.ts reuse.

import { z } from "zod";

import {
  DEFAULT_GARAGE_DISTANCE_MILES,
  GARAGE_DISTANCE_OPTIONS,
  PREFERRED_WINDOWS,
  REQUEST_CONSENTS,
  REQUEST_SERVICE_MODES,
  VEHICLE_MAKES,
  type ConsentItem,
} from "@/lib/domain";
import { addDaysToDate, isValidDateString } from "@/lib/time";

export const MIN_VEHICLE_YEAR = 1960;
export const MAX_MILEAGE = 2_000_000;
export const VEHICLE_MODEL_MAX_LENGTH = 60;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const STREET_ADDRESS_MAX_LENGTH = 200;
export const CITY_MAX_LENGTH = 80;
export const LOCATION_NOTES_MAX_LENGTH = 300;
export const EMAIL_MAX_LENGTH = 254;
/** The preferred date may be today or up to this many days ahead (in the ZIP's time zone). */
export const PREFERRED_DATE_MAX_DAYS_AHEAD = 60;
export const CANCEL_REASON_MAX_LENGTH = 500;

/** Form field names for the request form's file inputs (read on the server). */
export const REQUEST_PHOTO_FIELD = "photos";
export const REQUEST_VIDEO_FIELD = "video";

/** USPS codes: the 50 states, DC and the inhabited territories. */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY", "AS", "GU", "MP", "PR", "VI",
] as const;

// ---------------------------------------------------------------------------------
// Field helpers shared with booking.ts and support.ts
// ---------------------------------------------------------------------------------

/** Field errors keyed by field name, the shape form states pass to `Field`/`FormErrorSummary`. */
export type FieldErrors = Record<string, string[]>;

export type FormParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors; values: Record<string, string | string[]> };

/** Record ids are server-generated UUIDs (seeded fixtures may use other short slugs). */
export const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const MAX_ECHO_LENGTH = 4000;
const MAX_LIST_VALUES = 20;

/** Zod issues as field errors keyed by the first path segment (unique messages, in order). */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    const messages = (result[key] ??= []);
    if (!messages.includes(issue.message)) messages.push(issue.message);
  }
  return result;
}

// Control characters other than tab and line breaks never belong in form text (SQLite's
// length() also stops counting at a NUL, which would defeat the schema's length CHECKs).
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function cleanText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "").trim();
}

/**
 * Length in Unicode code points, the way SQLite's length() counts text. Minimum lengths use
 * it so text that passes here also passes the database CHECKs (an emoji is 2 UTF-16 units).
 */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** A trimmed string; null and undefined become undefined (so "required" messages apply). */
export function trimmedString(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? cleanText(value) : value;
}

/** A trimmed string, or null when empty or missing. */
export function trimmedOrNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = cleanText(value);
  return trimmed === "" ? null : trimmed;
}

/** Whole numbers from numbers or digit strings; anything else is left for the schema to reject. */
export function toInteger(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value ?? undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return /^-?\d{1,15}$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Optional free text: trimmed, empty becomes null, at most `max` characters. */
export function optionalText(max: number, tooLongMessage: string) {
  return z.preprocess(
    trimmedOrNull,
    z.string({ error: "Enter text here." }).max(max, { error: tooLongMessage }).nullable(),
  );
}

/** A record id from a hidden field or a select (opaque to the person, so one generic message). */
export function recordIdField(message: string) {
  return z.preprocess(
    trimmedString,
    z.string({ error: message }).regex(RECORD_ID_PATTERN, { error: message }),
  );
}

/** An optional record id: empty or missing becomes null. */
export function optionalRecordIdField(message: string) {
  return z.preprocess(trimmedOrNull, z.string().regex(RECORD_ID_PATTERN, { error: message }).nullable());
}

/** A required email address, trimmed and lowercased. */
export function emailField(requiredMessage: string) {
  return z.preprocess(
    trimmedString,
    z
      .string({ error: requiredMessage })
      .min(1, { error: requiredMessage, abort: true })
      .max(EMAIL_MAX_LENGTH, { error: `Enter an email address of ${EMAIL_MAX_LENGTH} characters or fewer.`, abort: true })
      .toLowerCase()
      .pipe(z.email({ error: "Enter a valid email address, like name@example.com." })),
  );
}

/**
 * Consent checkboxes (one shared field name, each value a consent key). Every item must be
 * accepted; the output lists all keys in their canonical order.
 */
export function consentKeysField<const Item extends ConsentItem>(items: readonly Item[], message: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? [] : typeof value === "string" ? [value] : value),
    z
      .array(z.string(), { error: message })
      .max(MAX_LIST_VALUES, { error: message })
      .transform((keys, ctx): Item["key"][] => {
        const accepted = new Set(keys);
        if (items.every((item) => accepted.has(item.key))) return items.map((item) => item.key);
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }),
  );
}

/** Every string value submitted under `name` (checkbox groups, multi-selects). */
export function formStrings(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_LIST_VALUES);
}

/**
 * Parses the named FormData fields with `schema`. Fields listed in `listFields` are read
 * with getAll (checkbox groups). On failure, returns field errors and the submitted values
 * (capped) to echo back as defaults.
 */
export function parseFormWith<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  fields: readonly string[],
  listFields: readonly string[] = [],
): FormParseResult<z.output<S>> {
  const raw: Record<string, unknown> = {};
  const values: Record<string, string | string[]> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") {
      raw[field] = value;
      values[field] = value.slice(0, MAX_ECHO_LENGTH);
    }
  }
  for (const field of listFields) {
    const list = formStrings(formData, field);
    raw[field] = list;
    values[field] = list;
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error), values };
}

// ---------------------------------------------------------------------------------
// Phone numbers and dates
// ---------------------------------------------------------------------------------

/**
 * Normalizes a US phone number to "602-555-0142". Accepts common spellings such as
 * "(602) 555-0142", "602.555.0142", "+1 602 555 0142" and "6025550142". Returns null for
 * anything that is not a 10-digit North American number (letters, extensions, other
 * countries, area or exchange codes starting with 0 or 1).
 */
export function normalizeUsPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]{7,25}$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** The allowed preferred dates for someone whose local date is `todayLocal` (YYYY-MM-DD). */
export function preferredDateBounds(todayLocal: string): { min: string; max: string } {
  return { min: todayLocal, max: addDaysToDate(todayLocal, PREFERRED_DATE_MAX_DAYS_AHEAD) };
}

/** A message when `date` is outside today..today+60 days, else null. Dates compare as text. */
export function preferredDateError(date: string, todayLocal: string): string | null {
  const { min, max } = preferredDateBounds(todayLocal);
  if (date < min) return "Choose today or a later date.";
  if (date > max) return `Choose a date within the next ${PREFERRED_DATE_MAX_DAYS_AHEAD} days.`;
  return null;
}

/** Model years accepted at the instant `now`: 1960 through next year. */
export function vehicleYearBounds(now: Date): { min: number; max: number } {
  return { min: MIN_VEHICLE_YEAR, max: now.getUTCFullYear() + 1 };
}

// ---------------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------------

function zipValue(value: unknown): unknown {
  const text = trimmedString(value);
  // ZIP+4 ("85004-1234") is accepted; matching only needs the 5-digit ZIP.
  return typeof text === "string" && /^\d{5}-\d{4}$/.test(text) ? text.slice(0, 5) : text;
}

function upperCodeOrNull(value: unknown): unknown {
  const text = trimmedOrNull(value);
  return typeof text === "string" ? text.toUpperCase() : text;
}

function mileageValue(value: unknown): unknown {
  // "98,000" and "98 000" are common ways to type mileage.
  return typeof value === "string" ? toInteger(value.replace(/[,\s]/g, "")) : toInteger(value);
}

function yesNoValue(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

function garageDistanceValue(value: unknown): unknown {
  // Only used for garage/either requests; the form may omit it for mobile requests.
  if (value === undefined || value === null || value === "") return DEFAULT_GARAGE_DISTANCE_MILES;
  return toInteger(value);
}

function multilineText(value: unknown): unknown {
  const text = trimmedString(value);
  return typeof text === "string" ? text.replace(/\r\n?/g, "\n") : text;
}

/**
 * What each required field says when it is left empty. The schema uses the same words, and
 * the request wizard shows them right at the field when "Next" finds it empty.
 */
export const REQUEST_REQUIRED_MESSAGES = {
  zip: "Enter the ZIP code where the car is.",
  vehicleYear: "Choose the model year.",
  vehicleMake: "Choose the vehicle's make.",
  vehicleModel: "Enter the model, like Camry.",
  mileage: "Enter the mileage as a whole number, like 98,000.",
  categoryId: "Choose the kind of repair you need.",
  description: "Describe the problem.",
  drivable: "Tell us whether the car can be driven.",
  preferredDate: "Choose a preferred date.",
  preferredWindow: "Choose a preferred time of day.",
  serviceMode: "Choose where the work should happen.",
  contactPhone: "Enter a phone number for this repair.",
  contactEmail: "Enter an email address for this repair.",
  acceptedConsentKeys: "Tick all three statements to send your request.",
} as const;

export type RequestRequiredField = keyof typeof REQUEST_REQUIRED_MESSAGES;

const REQUIRED = REQUEST_REQUIRED_MESSAGES;

/**
 * The repair-request schema at the instant `now` (it bounds the vehicle year). Output is
 * the typed `RepairRequestInput`; error messages are written for the person filling in
 * the form and keyed by field name.
 */
export function createRepairRequestSchema(options: { now: Date }) {
  const years = vehicleYearBounds(options.now);
  const yearMessage = `Enter a model year from ${years.min} to ${years.max}, like 2016.`;

  return z.object({
    zip: z.preprocess(
      zipValue,
      z
        .string({ error: REQUIRED.zip })
        .min(1, { error: REQUIRED.zip, abort: true })
        .regex(/^\d{5}$/, { error: "Enter a 5-digit ZIP code, like 85004." }),
    ),
    streetAddress: optionalText(
      STREET_ADDRESS_MAX_LENGTH,
      `Keep the street address to ${STREET_ADDRESS_MAX_LENGTH} characters or fewer.`,
    ),
    city: optionalText(CITY_MAX_LENGTH, `Keep the city to ${CITY_MAX_LENGTH} characters or fewer.`),
    state: z.preprocess(
      upperCodeOrNull,
      z.enum(US_STATE_CODES, { error: "Use the 2-letter state code, like AZ." }).nullable(),
    ),
    locationNotes: optionalText(
      LOCATION_NOTES_MAX_LENGTH,
      `Keep the location notes to ${LOCATION_NOTES_MAX_LENGTH} characters or fewer.`,
    ),
    vehicleYear: z.preprocess(
      toInteger,
      z
        .number({ error: yearMessage })
        .int({ error: yearMessage })
        .min(years.min, { error: yearMessage })
        .max(years.max, { error: yearMessage }),
    ),
    vehicleMake: z.enum(VEHICLE_MAKES, { error: REQUIRED.vehicleMake }),
    vehicleModel: z.preprocess(
      trimmedString,
      z
        .string({ error: REQUIRED.vehicleModel })
        .min(1, { error: REQUIRED.vehicleModel, abort: true })
        .max(VEHICLE_MODEL_MAX_LENGTH, {
          error: `Keep the model to ${VEHICLE_MODEL_MAX_LENGTH} characters or fewer.`,
        }),
    ),
    mileage: z.preprocess(
      mileageValue,
      z
        .number({ error: REQUIRED.mileage })
        .int({ error: REQUIRED.mileage })
        .min(0, { error: "Mileage can't be negative." })
        .max(MAX_MILEAGE, { error: "Enter a mileage of 2,000,000 or less." }),
    ),
    categoryId: z.preprocess(
      trimmedString,
      z
        .string({ error: REQUIRED.categoryId })
        .regex(/^[a-z_]{1,40}$/, { error: REQUIRED.categoryId }),
    ),
    description: z.preprocess(
      multilineText,
      z
        .string({ error: REQUIRED.description })
        .min(1, { error: REQUIRED.description, abort: true })
        .refine((text) => characterCount(text) >= DESCRIPTION_MIN_LENGTH, {
          error: `Add a little more detail: at least ${DESCRIPTION_MIN_LENGTH} characters.`,
        })
        .max(DESCRIPTION_MAX_LENGTH, {
          error: `Keep the description to ${DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
        }),
    ),
    drivable: z.preprocess(yesNoValue, z.boolean({ error: REQUIRED.drivable })),
    preferredDate: z.preprocess(
      trimmedString,
      z
        .string({ error: REQUIRED.preferredDate })
        .min(1, { error: REQUIRED.preferredDate, abort: true })
        .refine(isValidDateString, { error: "Choose a valid date." }),
    ),
    preferredWindow: z.enum(PREFERRED_WINDOWS, { error: REQUIRED.preferredWindow }),
    serviceMode: z.enum(REQUEST_SERVICE_MODES, { error: REQUIRED.serviceMode }),
    maxGarageDistanceMiles: z.preprocess(
      garageDistanceValue,
      z.literal(GARAGE_DISTANCE_OPTIONS, { error: "Choose how far you're willing to drive to a garage." }),
    ),
    contactPhone: z.preprocess(
      trimmedString,
      z
        .string({ error: REQUIRED.contactPhone })
        .min(1, { error: REQUIRED.contactPhone, abort: true })
        .transform((value, ctx) => {
          const normalized = normalizeUsPhone(value);
          if (normalized) return normalized;
          ctx.addIssue({ code: "custom", message: "Enter a 10-digit US phone number, like 602-555-0142." });
          return z.NEVER;
        }),
    ),
    contactEmail: emailField(REQUIRED.contactEmail),
    acceptedConsentKeys: consentKeysField(
      REQUEST_CONSENTS,
      REQUIRED.acceptedConsentKeys,
    ),
  });
}

export type RepairRequestSchema = ReturnType<typeof createRepairRequestSchema>;
/** Typed, normalized request input (the schema's output). */
export type RepairRequestInput = z.output<RepairRequestSchema>;
export type RequestFormField = keyof RepairRequestInput;

/** Labels for the error summary (FormErrorSummary `labels`), keyed by field name. */
export const REQUEST_FIELD_LABELS: Readonly<Record<RequestFormField | "photos" | "video", string>> = {
  zip: "ZIP code",
  streetAddress: "Street address",
  city: "City",
  state: "State",
  locationNotes: "Location notes",
  vehicleYear: "Year",
  vehicleMake: "Make",
  vehicleModel: "Model",
  mileage: "Mileage",
  categoryId: "Kind of repair",
  description: "Problem description",
  drivable: "Drivable",
  preferredDate: "Preferred date",
  preferredWindow: "Preferred time",
  serviceMode: "Service location",
  maxGarageDistanceMiles: "Garage distance",
  contactPhone: "Phone",
  contactEmail: "Email",
  acceptedConsentKeys: "Agreements",
  photos: "Photos",
  video: "Video",
};

const TEXT_FIELDS = [
  "zip",
  "streetAddress",
  "city",
  "state",
  "locationNotes",
  "vehicleYear",
  "vehicleMake",
  "vehicleModel",
  "mileage",
  "categoryId",
  "description",
  "drivable",
  "preferredDate",
  "preferredWindow",
  "serviceMode",
  "maxGarageDistanceMiles",
  "contactPhone",
  "contactEmail",
] as const satisfies readonly RequestFormField[];

type RequestTextField = (typeof TEXT_FIELDS)[number];

/** What the person typed, echoed back after a failed submit (file inputs cannot be refilled). */
export type RequestFormValues = Partial<Record<RequestTextField, string>> & {
  acceptedConsentKeys?: string[];
};

export type RequestFormResult =
  | { ok: true; data: RepairRequestInput; values: RequestFormValues }
  | { ok: false; fieldErrors: FieldErrors; values: RequestFormValues };

/** The raw values of the request form (each capped for echoing; parsing uses the full text). */
export function readRequestFormValues(formData: FormData): RequestFormValues {
  const values: RequestFormValues = {};
  for (const field of TEXT_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, MAX_ECHO_LENGTH);
  }
  values.acceptedConsentKeys = formStrings(formData, "acceptedConsentKeys");
  return values;
}

/**
 * Turns the request form's FormData into typed input, or field errors keyed by field name.
 * Pass `todayLocal` (YYYY-MM-DD) to also check the preferred-date window; the server checks
 * it again in the ZIP's time zone, together with the category and pilot ZIP.
 */
export function parseRepairRequestForm(
  formData: FormData,
  options: { now: Date; todayLocal?: string },
): RequestFormResult {
  const values = readRequestFormValues(formData);
  const raw: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  raw.acceptedConsentKeys = formStrings(formData, "acceptedConsentKeys");

  const parsed = createRepairRequestSchema(options).safeParse(raw);
  const fieldErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
  if (options.todayLocal && !fieldErrors.preferredDate && typeof raw.preferredDate === "string") {
    const dateError = isValidDateString(raw.preferredDate.trim())
      ? preferredDateError(raw.preferredDate.trim(), options.todayLocal)
      : null;
    if (dateError) fieldErrors.preferredDate = [dateError];
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };
  return { ok: true, data: parsed.data, values };
}

// ---------------------------------------------------------------------------------
// Cancelling a request
// ---------------------------------------------------------------------------------

export const cancelRequestSchema = z.object({
  requestId: recordIdField("Choose a request to cancel."),
  reason: optionalText(
    CANCEL_REASON_MAX_LENGTH,
    `Keep the reason to ${CANCEL_REASON_MAX_LENGTH} characters or fewer.`,
  ),
});
export type CancelRequestInput = z.output<typeof cancelRequestSchema>;

export function parseCancelRequestForm(formData: FormData): FormParseResult<CancelRequestInput> {
  return parseFormWith(cancelRequestSchema, formData, ["requestId", "reason"]);
}
