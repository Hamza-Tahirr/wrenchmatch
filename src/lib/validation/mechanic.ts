// Forms of the mechanic area (application, profile, services and makes, weekly availability,
// accepting jobs, documents) plus the form helpers quote.ts reuses. Safe for client and server.
//
// Every form has three parts:
//   * `...FormValues`: the raw strings a <form> submits, keyed by input name. The
//     `...ValuesFromFormData` helpers read them from FormData (repeated rows use indexed names
//     such as `availability.0.start`); a failed submit echoes them back as defaultValues.
//   * `parse...Form(values)`: validates every field at once and returns the typed command, or
//     field errors keyed by input name ("availability.2.end"), ready for FormErrorSummary.
//   * `...CommandSchema`: the typed command a domain function in src/server/mechanic accepts.
//     The domain re-validates its input with it, so no caller can skip validation.
// Rules that need the database or the clock (the ZIP exists, the category is enabled, the
// insurance expires after today) are checked by the domain functions, which report them with
// the same field names.

import { z } from "zod";

import {
  CONSENT_VERSION,
  DOCUMENT_KINDS,
  MECHANIC_SERVICE_MODES,
  VEHICLE_MAKES,
  type ConsentItem,
  type DocumentKind,
  type MechanicServiceMode,
  type VehicleMake,
} from "@/lib/domain";
import { formatCents } from "@/lib/format";
import { formatMinuteOfDay, isValidDateString } from "@/lib/time";

// ---------------------------------------------------------------------------------
// Form helpers (also used by quote.ts)
// ---------------------------------------------------------------------------------

/** Error messages keyed by input name; rows use dotted paths such as "parts.0.unitPrice". */
export type FieldErrors = Record<string, string[]>;

export type FormParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors; formError?: string };

/**
 * useActionState state for the mechanic forms: a failure echoes the submitted `values` (feed
 * them back as defaultValue; file inputs can't be refilled) and errors keyed by input name.
 * `code` is the DomainError code when the domain refused the command (e.g. "slot_conflict").
 */
export type MechanicFormState<V> =
  | { ok: true; message?: string }
  | { ok: false; formError?: string; fieldErrors?: FieldErrors; values?: V; code?: string };

/** Result of a one-click mechanic action (confirm dialogs and single buttons). */
export type ActionResult = { ok: true; message?: string } | { ok: false; formError: string };

export type FieldPath = readonly (string | number)[];

/** Longest raw value kept from FormData (field rules reject long values with a message). */
const MAX_RAW_LENGTH = 5000;
const MAX_MULTI_VALUES = 60;

const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001f\u007f]/;
// Multi-line fields keep tabs and line breaks.
const MULTI_LINE_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const WHOLE_NUMBER = /^\d{1,9}$/;
// "$1,234.50", "1234.5", "120", ".75": dollars with optional thousands commas and 0-2 decimals.
const DOLLARS = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d{1,9})?(?:\.(\d{1,2}))?$/;

export const ZIP_PATTERN = /^\d{5}$/;

/** A text input's value, or "" when it is missing or a file. */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, MAX_RAW_LENGTH) : "";
}

/** Every text value submitted under `name` (checkbox groups, multi-selects). */
export function formTexts(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_MULTI_VALUES)
    .map((value) => value.slice(0, 200));
}

/** A checkbox or toggle: "on" (the browser default), "true", "yes" or "1" mean checked. */
export function formCheckbox(formData: FormData, name: string): boolean {
  return ["on", "true", "yes", "1"].includes(formText(formData, name).trim().toLowerCase());
}

/**
 * Repeated rows submitted with indexed names, e.g. `parts.0.description`, `parts.0.quantity`.
 * Row i of the result is the row the form numbered i (missing numbers become blank rows), so
 * an error path such as "parts.2.unitPrice" names the input that caused it. Indexes from
 * `maxRows` on are ignored.
 */
export function formRows<K extends string>(
  formData: FormData,
  prefix: string,
  fields: readonly K[],
  maxRows: number,
): Record<K, string>[] {
  const blank = () => Object.fromEntries(fields.map((field) => [field, ""])) as Record<K, string>;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escape(prefix)}\\.(\\d{1,3})\\.(${fields.map(escape).join("|")})$`);
  const rows: Record<K, string>[] = [];
  for (const [key, value] of formData.entries()) {
    const match = pattern.exec(key);
    if (!match || typeof value !== "string") continue;
    const index = Number(match[1]);
    if (index >= maxRows) continue;
    const row = (rows[index] ??= blank());
    row[match[2] as K] = value.slice(0, MAX_RAW_LENGTH);
  }
  return Array.from({ length: rows.length }, (_, index) => rows[index] ?? blank());
}

/** True when every value of a row is empty: an unused row the form left blank. */
export function isBlankRow(row: Readonly<Record<string, string>>, fields?: readonly string[]): boolean {
  const keys = fields ?? Object.keys(row);
  return keys.every((key) => (row[key] ?? "").trim() === "");
}

/**
 * Whole dollars and cents typed by a person ("$1,250", "45.5", "120.00") as integer cents,
 * without floating-point arithmetic. Null for anything else (negative, 3+ decimals, letters).
 */
export function parseDollarsToCents(raw: string): number | null {
  const match = DOLLARS.exec(raw.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const dollars = Number((match[1] ?? "0").replaceAll(",", ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Integer cents as an input value: 12050 -> "120.50", 12000 -> "120.00". */
export function centsToDollarInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`Expected integer cents, received ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "HH:mm" (or "HH:mm:ss") as minutes from midnight; "24:00" and an end of "00:00" mean 1440. */
export function parseTimeOfDay(raw: string, options: { isEnd?: boolean } = {}): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours === 24 && minutes === 0) return 1440;
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return options.isEnd && total === 0 ? 1440 : total;
}

/** Minutes from midnight as a time-input value: 480 -> "08:00", 1440 -> "00:00" (midnight). */
export function minutesToTimeInput(minutes: number): string {
  const normalized = minutes === 1440 ? 0 : minutes;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

type TextRule = {
  /** Subject used in generated messages, e.g. "Your display name". */
  name: string;
  max: number;
  min?: number;
  /** Message for an empty required value. */
  required?: string;
  multiline?: boolean;
};

type IntegerRule = { name: string; min: number; max: number; required?: string; outOfRange?: string };

type MoneyRule = { name: string; required?: string; allowZero: boolean; maxCents: number };

/**
 * Reads raw form strings into typed values while collecting every problem as an issue at its
 * field path. Each read returns undefined when it reported an issue, so callers can build the
 * command only when everything they need is defined.
 */
export class FormReader {
  #failed = false;
  readonly #report: (path: FieldPath, message: string) => void;

  constructor(report: (path: FieldPath, message: string) => void) {
    this.#report = report;
  }

  /** Reads against a Zod transform/refinement context. */
  static for(ctx: z.RefinementCtx): FormReader {
    return new FormReader((path, message) => ctx.addIssue({ code: "custom", message, path: [...path] }));
  }

  get failed(): boolean {
    return this.#failed;
  }

  issue(path: FieldPath, message: string): undefined {
    this.#failed = true;
    this.#report(path, message);
    return undefined;
  }

  /** A required text value, trimmed. */
  text(path: FieldPath, raw: string, rule: TextRule): string | undefined {
    const value = raw.trim();
    if (value === "") return this.issue(path, rule.required ?? `Enter ${rule.name.toLowerCase()}.`);
    return this.#checkText(path, value, rule);
  }

  /** An optional text value: null when left empty. */
  optionalText(path: FieldPath, raw: string, rule: TextRule): string | null | undefined {
    const value = raw.trim();
    if (value === "") return null;
    return this.#checkText(path, value, rule);
  }

  #checkText(path: FieldPath, value: string, rule: TextRule): string | undefined {
    if ((rule.multiline ? MULTI_LINE_FORBIDDEN : SINGLE_LINE_FORBIDDEN).test(value)) {
      return this.issue(path, `${rule.name} contains characters that can't be used. Remove them and try again.`);
    }
    if (rule.min !== undefined && value.length < rule.min) {
      return this.issue(path, `${rule.name} needs at least ${rule.min} characters.`);
    }
    if (value.length > rule.max) {
      return this.issue(path, `${rule.name} can be at most ${rule.max} characters (now ${value.length}).`);
    }
    return value;
  }

  /** A required whole number within [min, max]. */
  integer(path: FieldPath, raw: string, rule: IntegerRule): number | undefined {
    const value = raw.trim();
    if (value === "") return this.issue(path, rule.required ?? `Enter ${rule.name.toLowerCase()}.`);
    const range = rule.outOfRange ?? `${rule.name} must be a whole number from ${rule.min} to ${rule.max}.`;
    if (!WHOLE_NUMBER.test(value)) return this.issue(path, range);
    const number = Number(value);
    if (number < rule.min || number > rule.max) return this.issue(path, range);
    return number;
  }

  /** A dollar amount as integer cents. */
  cents(path: FieldPath, raw: string, rule: MoneyRule): number | undefined {
    const value = raw.trim();
    if (value === "") return this.issue(path, rule.required ?? `Enter ${rule.name.toLowerCase()}.`);
    const cents = parseDollarsToCents(value);
    if (cents === null) {
      return this.issue(path, `Enter ${rule.name.toLowerCase()} in dollars and cents, like 120 or 120.50.`);
    }
    if (cents === 0 && !rule.allowZero) return this.issue(path, `${rule.name} must be more than $0.`);
    if (cents > rule.maxCents) return this.issue(path, `${rule.name} can be at most ${formatCents(rule.maxCents)}.`);
    return cents;
  }

  /** One of `options` (exact value). */
  choice<T extends string>(path: FieldPath, raw: string, options: readonly T[], message: string): T | undefined {
    const value = raw.trim();
    const match = options.find((option) => option === value);
    return match === undefined ? this.issue(path, message) : match;
  }

  /** A required calendar date "YYYY-MM-DD" (the value of <input type="date">). */
  date(path: FieldPath, raw: string, message: string): string | undefined {
    const value = raw.trim();
    return isValidDateString(value) && value <= "2100-12-31" ? value : this.issue(path, message);
  }

  /** An optional calendar date: null when left empty. */
  optionalDate(path: FieldPath, raw: string, message: string): string | null | undefined {
    return raw.trim() === "" ? null : this.date(path, raw, message);
  }
}

function fieldErrorsFrom(error: z.ZodError): { fieldErrors: FieldErrors; formError?: string } {
  const fieldErrors: FieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    if (issue.path.length === 0) formErrors.push(issue.message);
    else (fieldErrors[issue.path.map(String).join(".")] ??= []).push(issue.message);
  }
  return formErrors.length > 0 ? { fieldErrors, formError: formErrors[0] } : { fieldErrors };
}

/** Runs a form schema and shapes the result for a useActionState form state. */
export function toFormResult<T>(result: z.ZodSafeParseResult<T>): FormParseResult<T> {
  return result.success ? { ok: true, data: result.data } : { ok: false, ...fieldErrorsFrom(result.error) };
}

// Building blocks of the typed command schemas.
export const singleLineText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !SINGLE_LINE_FORBIDDEN.test(value), "Contains characters that can't be used.");

export const multiLineText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !MULTI_LINE_FORBIDDEN.test(value), "Contains characters that can't be used.");

export const calendarDate = () => z.string().refine(isValidDateString, "Expected a date YYYY-MM-DD.");

// ---------------------------------------------------------------------------------
// Mechanic terms (accepted with the application; the snapshot goes in the audit log)
// ---------------------------------------------------------------------------------

export const MECHANIC_TERMS_VERSION = CONSENT_VERSION;

export const MECHANIC_TERMS = [
  {
    key: "independent_contractor",
    text: "I am an independent contractor, not an employee or agent of WrenchMatch. I set my own prices and availability, and I am responsible for my work, licenses, taxes and insurance. (Provisional terms: not yet reviewed by counsel.)",
  },
  {
    key: "quote_commitment",
    text: "A quote I submit commits me to its price, scope and offered time slot until the quote expires, so I won't offer that time to anyone else. I can withdraw a quote only before the customer selects it.",
  },
  {
    key: "booking_acceptance",
    text: "When a customer selects and pays for my quote, the booking is accepted without a second approval from me. Extra work or cost needs a change order that the customer approves first.",
  },
  {
    key: "accurate_information",
    text: "My application details and documents are accurate. An admin reviews every application, and I must keep my insurance current to receive jobs.",
  },
] as const satisfies readonly ConsentItem[];

// ---------------------------------------------------------------------------------
// Limits (mirror the CHECK constraints in db/migrations/0001_init.sql)
// ---------------------------------------------------------------------------------

export const MECHANIC_FORM_LIMITS = {
  displayNameMax: 60,
  legalNameMax: 120,
  businessNameMax: 120,
  phoneMax: 32,
  emailMax: 254,
  bioMax: 1000,
  certificationsMax: 500,
  garageLine1Max: 200,
  garageCityMax: 80,
  insuranceProviderMax: 120,
  policyNumberMax: 80,
  travelRadiusMin: 1,
  travelRadiusMax: 100,
  yearsExperienceMax: 60,
  /** Weekly availability windows (4 per day). */
  availabilityWindowsMax: 28,
  servicesMax: 20,
  /** Optional certification documents attached to an application. */
  certificationDocsMax: 3,
} as const;

export const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

const WEEKDAY_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;

/** "8:00 AM–12:00 PM" */
export function formatTimeRange(window: { startMinute: number; endMinute: number }): string {
  return `${formatMinuteOfDay(window.startMinute)}–${formatMinuteOfDay(window.endMinute)}`;
}

/** "Mon 8:00 AM–12:00 PM" */
export function formatAvailabilityWindow(window: { weekday: number; startMinute: number; endMinute: number }): string {
  const day = WEEKDAYS[window.weekday]?.short ?? "?";
  return `${day} ${formatTimeRange(window)}`;
}

const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
const CATEGORY_ID = /^[a-z][a-z_]{0,59}$/;
const STATE_CODE = /^[A-Za-z]{2}$/;

// ---------------------------------------------------------------------------------
// Profile fields (application and profile form)
// ---------------------------------------------------------------------------------

/** Raw values of the profile fields, keyed by input name. */
export type MechanicProfileFormValues = {
  /** Public name customers see, e.g. "Marco R." or a shop name. */
  displayName: string;
  /** Private. */
  legalName: string;
  /** Private, optional. */
  businessName: string;
  /** Private. */
  phone: string;
  /** Private contact email (may differ from the login email). */
  contactEmail: string;
  /** Optional public "about" text. */
  bio: string;
  /** 5-digit base ZIP; the approximate base point is its centroid. */
  baseZip: string;
  travelRadiusMiles: string;
  /** "mobile" | "garage" | "both" */
  serviceMode: string;
  /** Private garage address, required for "garage" and "both". */
  garageAddressLine1: string;
  garageCity: string;
  garageState: string;
  garageZip: string;
  yearsExperience: string;
  certifications: string;
  insuranceProvider: string;
  /** Private. */
  insurancePolicyNumber: string;
  /** "YYYY-MM-DD"; must be after today (checked on the server). */
  insuranceExpiresOn: string;
};

export type GarageAddress = { line1: string; city: string; state: string; zip: string };

export type MechanicProfileCommand = {
  displayName: string;
  legalName: string;
  businessName: string | null;
  phone: string;
  contactEmail: string;
  bio: string | null;
  baseZip: string;
  travelRadiusMiles: number;
  serviceMode: MechanicServiceMode;
  /** Null for mobile-only mechanics. */
  garageAddress: GarageAddress | null;
  yearsExperience: number;
  certifications: string | null;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiresOn: string;
};

const PROFILE_FIELD_NAMES = [
  "displayName",
  "legalName",
  "businessName",
  "phone",
  "contactEmail",
  "bio",
  "baseZip",
  "travelRadiusMiles",
  "serviceMode",
  "garageAddressLine1",
  "garageCity",
  "garageState",
  "garageZip",
  "yearsExperience",
  "certifications",
  "insuranceProvider",
  "insurancePolicyNumber",
  "insuranceExpiresOn",
] as const satisfies readonly (keyof MechanicProfileFormValues)[];

const profileValuesShape = Object.fromEntries(
  PROFILE_FIELD_NAMES.map((name) => [name, z.string().default("")]),
) as Record<(typeof PROFILE_FIELD_NAMES)[number], z.ZodDefault<z.ZodString>>;

export function mechanicProfileValuesFromFormData(formData: FormData): MechanicProfileFormValues {
  return Object.fromEntries(
    PROFILE_FIELD_NAMES.map((name) => [name, formText(formData, name)]),
  ) as MechanicProfileFormValues;
}

function readPhone(r: FormReader, raw: string): string | undefined {
  const value = r.text(["phone"], raw, {
    name: "Your phone number",
    max: MECHANIC_FORM_LIMITS.phoneMax,
    required: "Enter a phone number with area code, like 602-555-0142.",
  });
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, "").length;
  if (!PHONE_CHARACTERS.test(value) || digits < 10 || digits > 15) {
    return r.issue(["phone"], "Enter a phone number with area code, like 602-555-0142.");
  }
  return value;
}

function readEmail(r: FormReader, raw: string): string | undefined {
  const value = r.text(["contactEmail"], raw, {
    name: "Your contact email",
    max: MECHANIC_FORM_LIMITS.emailMax,
    required: "Enter the email address customers can use after a confirmed booking.",
  });
  if (value === undefined) return undefined;
  return z.email().safeParse(value).success
    ? value.toLowerCase()
    : r.issue(["contactEmail"], "Enter a valid email address, like name@example.com.");
}

function readZip(r: FormReader, path: FieldPath, raw: string, message: string): string | undefined {
  const value = raw.trim();
  return ZIP_PATTERN.test(value) ? value : r.issue(path, message);
}

function readGarageAddress(
  r: FormReader,
  values: MechanicProfileFormValues,
  serviceMode: MechanicServiceMode,
): GarageAddress | null | undefined {
  if (serviceMode === "mobile") return null;
  const line1 = r.text(["garageAddressLine1"], values.garageAddressLine1, {
    name: "The garage street address",
    max: MECHANIC_FORM_LIMITS.garageLine1Max,
    required: "Enter your garage's street address. It stays private until a confirmed booking.",
  });
  const city = r.text(["garageCity"], values.garageCity, {
    name: "The garage city",
    max: MECHANIC_FORM_LIMITS.garageCityMax,
    required: "Enter your garage's city.",
  });
  const stateRaw = values.garageState.trim();
  const state = STATE_CODE.test(stateRaw)
    ? stateRaw.toUpperCase()
    : r.issue(["garageState"], "Enter the 2-letter state code, like AZ.");
  const zip = readZip(r, ["garageZip"], values.garageZip, "Enter your garage's 5-digit ZIP code.");
  if (line1 === undefined || city === undefined || state === undefined || zip === undefined) return undefined;
  return { line1, city, state, zip };
}

function readProfileFields(r: FormReader, values: MechanicProfileFormValues): MechanicProfileCommand | undefined {
  const limits = MECHANIC_FORM_LIMITS;
  const displayName = r.text(["displayName"], values.displayName, {
    name: "Your display name",
    max: limits.displayNameMax,
    required: 'Enter the name customers will see, like "Marco R." or your shop name.',
  });
  const legalName = r.text(["legalName"], values.legalName, {
    name: "Your legal name",
    max: limits.legalNameMax,
    required: "Enter your legal name. It stays private.",
  });
  const businessName = r.optionalText(["businessName"], values.businessName, {
    name: "The business name",
    max: limits.businessNameMax,
  });
  const phone = readPhone(r, values.phone);
  const contactEmail = readEmail(r, values.contactEmail);
  const bio = r.optionalText(["bio"], values.bio, { name: "Your bio", max: limits.bioMax, multiline: true });
  const baseZip = readZip(r, ["baseZip"], values.baseZip, "Enter your base ZIP code (5 digits), like 85004.");
  const travelRadiusMiles = r.integer(["travelRadiusMiles"], values.travelRadiusMiles, {
    name: "Travel radius",
    min: limits.travelRadiusMin,
    max: limits.travelRadiusMax,
    required: "Enter how far you travel for mobile jobs, from 1 to 100 miles.",
    outOfRange: "Enter a travel radius from 1 to 100 miles.",
  });
  const serviceMode = r.choice(
    ["serviceMode"],
    values.serviceMode,
    MECHANIC_SERVICE_MODES,
    "Choose how you work: mobile, at your garage, or both.",
  );
  const garageAddress = serviceMode === undefined ? undefined : readGarageAddress(r, values, serviceMode);
  const yearsExperience = r.integer(["yearsExperience"], values.yearsExperience, {
    name: "Years of experience",
    min: 0,
    max: limits.yearsExperienceMax,
    required: "Enter your years of experience (0 is fine).",
    outOfRange: "Enter your years of experience as a whole number from 0 to 60.",
  });
  const certifications = r.optionalText(["certifications"], values.certifications, {
    name: "Certifications",
    max: limits.certificationsMax,
    multiline: true,
  });
  const insuranceProvider = r.text(["insuranceProvider"], values.insuranceProvider, {
    name: "The insurance provider",
    max: limits.insuranceProviderMax,
    required: "Enter your liability insurance provider.",
  });
  const insurancePolicyNumber = r.text(["insurancePolicyNumber"], values.insurancePolicyNumber, {
    name: "The policy number",
    max: limits.policyNumberMax,
    required: "Enter your insurance policy number. It stays private.",
  });
  const insuranceExpiresOn = r.date(
    ["insuranceExpiresOn"],
    values.insuranceExpiresOn,
    "Enter the date your insurance expires.",
  );

  if (
    displayName === undefined ||
    legalName === undefined ||
    businessName === undefined ||
    phone === undefined ||
    contactEmail === undefined ||
    bio === undefined ||
    baseZip === undefined ||
    travelRadiusMiles === undefined ||
    serviceMode === undefined ||
    garageAddress === undefined ||
    yearsExperience === undefined ||
    certifications === undefined ||
    insuranceProvider === undefined ||
    insurancePolicyNumber === undefined ||
    insuranceExpiresOn === undefined
  ) {
    return undefined;
  }
  return {
    displayName,
    legalName,
    businessName,
    phone,
    contactEmail,
    bio,
    baseZip,
    travelRadiusMiles,
    serviceMode,
    garageAddress,
    yearsExperience,
    certifications,
    insuranceProvider,
    insurancePolicyNumber,
    insuranceExpiresOn,
  };
}

const garageAddressCommandSchema = z.object({
  line1: singleLineText(MECHANIC_FORM_LIMITS.garageLine1Max),
  city: singleLineText(MECHANIC_FORM_LIMITS.garageCityMax),
  state: z.string().regex(/^[A-Z]{2}$/),
  zip: z.string().regex(ZIP_PATTERN),
});

const profileCommandShape = {
  displayName: singleLineText(MECHANIC_FORM_LIMITS.displayNameMax),
  legalName: singleLineText(MECHANIC_FORM_LIMITS.legalNameMax),
  businessName: singleLineText(MECHANIC_FORM_LIMITS.businessNameMax).nullable(),
  phone: z.string().trim().min(7).max(MECHANIC_FORM_LIMITS.phoneMax).regex(PHONE_CHARACTERS),
  contactEmail: z.email().max(MECHANIC_FORM_LIMITS.emailMax),
  bio: multiLineText(MECHANIC_FORM_LIMITS.bioMax).nullable(),
  baseZip: z.string().regex(ZIP_PATTERN),
  travelRadiusMiles: z.int().min(MECHANIC_FORM_LIMITS.travelRadiusMin).max(MECHANIC_FORM_LIMITS.travelRadiusMax),
  serviceMode: z.enum(MECHANIC_SERVICE_MODES),
  garageAddress: garageAddressCommandSchema.nullable(),
  yearsExperience: z.int().min(0).max(MECHANIC_FORM_LIMITS.yearsExperienceMax),
  certifications: multiLineText(MECHANIC_FORM_LIMITS.certificationsMax).nullable(),
  insuranceProvider: singleLineText(MECHANIC_FORM_LIMITS.insuranceProviderMax),
  insurancePolicyNumber: singleLineText(MECHANIC_FORM_LIMITS.policyNumberMax),
  insuranceExpiresOn: calendarDate(),
};

function checkGarageAddress(value: { serviceMode: MechanicServiceMode; garageAddress: GarageAddress | null }, ctx: z.RefinementCtx): void {
  if (value.serviceMode !== "mobile" && value.garageAddress === null) {
    ctx.addIssue({ code: "custom", message: "A garage address is required for garage service.", path: ["garageAddress"] });
  }
}

/** The typed input of updateProfile (src/server/mechanic/profile-commands.ts). */
export const mechanicProfileCommandSchema = z.object(profileCommandShape).superRefine(checkGarageAddress);

export const mechanicProfileFormSchema = z
  .object(profileValuesShape)
  .transform((values, ctx) => readProfileFields(FormReader.for(ctx), values) ?? z.NEVER)
  .pipe(mechanicProfileCommandSchema);

export function parseMechanicProfileForm(values: MechanicProfileFormValues): FormParseResult<MechanicProfileCommand> {
  return toFormResult(mechanicProfileFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Services and makes
// ---------------------------------------------------------------------------------

export type MechanicServicesFormValues = {
  /** Category ids (checkbox group "services"). */
  services: string[];
  /** Checkbox "allMakes". */
  allMakes: boolean;
  /** Checkbox group "makes" (ignored when allMakes is checked). */
  makes: string[];
};

export type MechanicServicesCommand = {
  /** Unique category ids; the domain checks they are enabled categories. */
  services: string[];
  allMakes: boolean;
  /** Empty when allMakes is true. */
  makes: VehicleMake[];
};

export function mechanicServicesValuesFromFormData(formData: FormData): MechanicServicesFormValues {
  return {
    services: formTexts(formData, "services"),
    allMakes: formCheckbox(formData, "allMakes"),
    makes: formTexts(formData, "makes"),
  };
}

const servicesValuesShape = {
  services: z.array(z.string()).default([]),
  allMakes: z.boolean().default(false),
  makes: z.array(z.string()).default([]),
};

function readServiceFields(r: FormReader, values: MechanicServicesFormValues): MechanicServicesCommand | undefined {
  const services = [...new Set(values.services.map((value) => value.trim()).filter(Boolean))];
  let servicesOk = true;
  if (services.length === 0) {
    servicesOk = false;
    r.issue(["services"], "Choose at least one service you offer.");
  } else if (services.length > MECHANIC_FORM_LIMITS.servicesMax || !services.every((id) => CATEGORY_ID.test(id))) {
    servicesOk = false;
    r.issue(["services"], "Choose services from the list.");
  }

  const makes: VehicleMake[] = [];
  let makesOk = true;
  if (!values.allMakes) {
    for (const raw of new Set(values.makes.map((value) => value.trim()).filter(Boolean))) {
      const make = VEHICLE_MAKES.find((candidate) => candidate === raw);
      if (make === undefined) {
        makesOk = false;
        r.issue(["makes"], `Choose makes from the list ("${raw.slice(0, 40)}" isn't one of them).`);
        break;
      }
      makes.push(make);
    }
    if (makesOk && makes.length === 0) {
      makesOk = false;
      r.issue(["makes"], "Choose the makes you service, or select All makes.");
    }
  }
  if (!servicesOk || !makesOk) return undefined;
  return { services, allMakes: values.allMakes, makes: values.allMakes ? [] : makes };
}

const servicesCommandShape = {
  services: z
    .array(z.string().regex(CATEGORY_ID))
    .min(1)
    .max(MECHANIC_FORM_LIMITS.servicesMax)
    .refine((ids) => new Set(ids).size === ids.length, "Each service can be listed once."),
  allMakes: z.boolean(),
  makes: z
    .array(z.enum(VEHICLE_MAKES))
    .max(VEHICLE_MAKES.length)
    .refine((makes) => new Set(makes).size === makes.length, "Each make can be listed once."),
};

function checkMakes(value: { allMakes: boolean; makes: readonly VehicleMake[] }, ctx: z.RefinementCtx): void {
  if (!value.allMakes && value.makes.length === 0) {
    ctx.addIssue({ code: "custom", message: "Choose at least one make, or all makes.", path: ["makes"] });
  }
}

/** The typed input of updateServicesAndMakes. */
export const mechanicServicesCommandSchema = z.object(servicesCommandShape).superRefine(checkMakes);

export const mechanicServicesFormSchema = z
  .object(servicesValuesShape)
  .transform((values, ctx) => readServiceFields(FormReader.for(ctx), values) ?? z.NEVER)
  .pipe(mechanicServicesCommandSchema);

export function parseMechanicServicesForm(values: MechanicServicesFormValues): FormParseResult<MechanicServicesCommand> {
  return toFormResult(mechanicServicesFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Weekly availability
// ---------------------------------------------------------------------------------

/** One window row: inputs `availability.<i>.weekday` ("0"-"6", 0 = Sunday), `.start`, `.end` ("HH:mm"). */
export type AvailabilityRowValues = { weekday: string; start: string; end: string };

export type MechanicAvailabilityFormValues = { availability: AvailabilityRowValues[] };

/** A weekly window in the mechanic's local time: minutes from midnight, end 1440 = midnight. */
export type AvailabilityWindowInput = { weekday: number; startMinute: number; endMinute: number };

export type MechanicAvailabilityCommand = { windows: AvailabilityWindowInput[] };

const AVAILABILITY_FIELDS = ["weekday", "start", "end"] as const;

export function mechanicAvailabilityValuesFromFormData(formData: FormData): MechanicAvailabilityFormValues {
  return {
    availability: formRows(formData, "availability", AVAILABILITY_FIELDS, MECHANIC_FORM_LIMITS.availabilityWindowsMax * 2),
  };
}

const availabilityRowShape = z.object({
  weekday: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
});

const availabilityValuesShape = { availability: z.array(availabilityRowShape).default([]) };

function readAvailabilityRows(r: FormReader, rows: readonly AvailabilityRowValues[]): AvailabilityWindowInput[] | undefined {
  const windows: { index: number; window: AvailabilityWindowInput }[] = [];
  let ok = true;
  rows.forEach((row, index) => {
    // The weekday usually comes from a select with a default, so a row counts as unused
    // when both times are empty.
    if (isBlankRow(row, ["start", "end"])) return;
    const path = (field: string): FieldPath => ["availability", index, field];
    const weekday = r.choice(path("weekday"), row.weekday, WEEKDAY_VALUES, "Choose a day of the week.");
    const start = parseTimeOfDay(row.start);
    const end = parseTimeOfDay(row.end, { isEnd: true });
    if (start === null) r.issue(path("start"), "Enter a start time, like 08:00.");
    if (end === null) r.issue(path("end"), "Enter an end time, like 17:00.");
    if (weekday === undefined || start === null || end === null) {
      ok = false;
      return;
    }
    if (end <= start) {
      ok = false;
      r.issue(path("end"), "The end time must be after the start time.");
      return;
    }
    windows.push({ index, window: { weekday: Number(weekday), startMinute: start, endMinute: end } });
  });

  if (ok && windows.length === 0) {
    r.issue(["availability"], "Add at least one weekly availability window.");
    return undefined;
  }
  if (windows.length > MECHANIC_FORM_LIMITS.availabilityWindowsMax) {
    r.issue(["availability"], `Add up to ${MECHANIC_FORM_LIMITS.availabilityWindowsMax} availability windows.`);
    return undefined;
  }
  // Windows on the same day may touch (8-12 and 12-17) but not overlap.
  for (const [position, current] of windows.entries()) {
    const earlier = windows
      .slice(0, position)
      .find(
        (other) =>
          other.window.weekday === current.window.weekday &&
          other.window.startMinute < current.window.endMinute &&
          current.window.startMinute < other.window.endMinute,
      );
    if (earlier) {
      ok = false;
      const day = WEEKDAYS[current.window.weekday].label;
      r.issue(
        ["availability", current.index, "start"],
        `This window overlaps another ${day} window (${formatTimeRange(earlier.window)}). Adjust or remove one of them.`,
      );
    }
  }
  return ok ? windows.map((entry) => entry.window) : undefined;
}

const availabilityWindowCommandSchema = z
  .object({
    weekday: z.int().min(0).max(6),
    startMinute: z.int().min(0).max(1439),
    endMinute: z.int().min(1).max(1440),
  })
  .refine((window) => window.endMinute > window.startMinute, "End must be after start.");

const windowsCommandSchema = z
  .array(availabilityWindowCommandSchema)
  .min(1)
  .max(MECHANIC_FORM_LIMITS.availabilityWindowsMax)
  .refine(
    (windows) =>
      windows.every((a, i) =>
        windows.every(
          (b, j) => i === j || a.weekday !== b.weekday || a.endMinute <= b.startMinute || b.endMinute <= a.startMinute,
        ),
      ),
    "Availability windows on the same day can't overlap.",
  );

/** The typed input of setAvailability. */
export const mechanicAvailabilityCommandSchema = z.object({ windows: windowsCommandSchema });

export const mechanicAvailabilityFormSchema = z
  .object(availabilityValuesShape)
  .transform((values, ctx) => {
    const windows = readAvailabilityRows(FormReader.for(ctx), values.availability);
    return windows === undefined ? z.NEVER : { windows };
  })
  .pipe(mechanicAvailabilityCommandSchema);

export function parseMechanicAvailabilityForm(
  values: MechanicAvailabilityFormValues,
): FormParseResult<MechanicAvailabilityCommand> {
  return toFormResult(mechanicAvailabilityFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Application (profile + services + availability + terms)
// ---------------------------------------------------------------------------------

export type MechanicApplicationFormValues = MechanicProfileFormValues &
  MechanicServicesFormValues &
  MechanicAvailabilityFormValues & {
    /** Checkbox "acceptTerms" (the MECHANIC_TERMS). */
    acceptTerms: boolean;
  };

export type MechanicApplicationCommand = MechanicProfileCommand &
  MechanicServicesCommand &
  MechanicAvailabilityCommand & {
    acceptedTerms: true;
  };

/**
 * Text fields of the application form. Files are read separately on the server
 * (prepareApplicationUploads): `profilePhoto` (optional), `idDocument`, `insuranceDocument`,
 * `certificationDocs` (optional, multiple).
 */
export function mechanicApplicationValuesFromFormData(formData: FormData): MechanicApplicationFormValues {
  return {
    ...mechanicProfileValuesFromFormData(formData),
    ...mechanicServicesValuesFromFormData(formData),
    ...mechanicAvailabilityValuesFromFormData(formData),
    acceptTerms: formCheckbox(formData, "acceptTerms"),
  };
}

/** The typed input of submitApplication. */
export const mechanicApplicationCommandSchema = z
  .object({
    ...profileCommandShape,
    ...servicesCommandShape,
    windows: windowsCommandSchema,
    acceptedTerms: z.literal(true),
  })
  .superRefine((value, ctx) => {
    checkGarageAddress(value, ctx);
    checkMakes(value, ctx);
  });

export const mechanicApplicationFormSchema = z
  .object({
    ...profileValuesShape,
    ...servicesValuesShape,
    ...availabilityValuesShape,
    acceptTerms: z.boolean().default(false),
  })
  .transform((values, ctx) => {
    const reader = FormReader.for(ctx);
    const profile = readProfileFields(reader, values);
    const services = readServiceFields(reader, values);
    const windows = readAvailabilityRows(reader, values.availability);
    if (!values.acceptTerms) reader.issue(["acceptTerms"], "Accept the mechanic terms to submit your application.");
    if (profile === undefined || services === undefined || windows === undefined || !values.acceptTerms) {
      return z.NEVER;
    }
    return { ...profile, ...services, windows, acceptedTerms: true as const };
  })
  .pipe(mechanicApplicationCommandSchema);

export function parseMechanicApplicationForm(
  values: MechanicApplicationFormValues,
): FormParseResult<MechanicApplicationCommand> {
  return toFormResult(mechanicApplicationFormSchema.safeParse(values));
}

// ---------------------------------------------------------------------------------
// Accepting jobs (a toggle)
// ---------------------------------------------------------------------------------

export type AcceptingJobsCommand = { acceptingJobs: boolean };

/** Reads the hidden input or checkbox "acceptingJobs" ("true"/"on" = accepting). */
export function acceptingJobsFromFormData(formData: FormData): AcceptingJobsCommand {
  return { acceptingJobs: formCheckbox(formData, "acceptingJobs") };
}

export const acceptingJobsCommandSchema = z.object({ acceptingJobs: z.boolean() });

// ---------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------

/** Text inputs of the "add document" form; the file input is named "document". */
export type MechanicDocumentFormValues = {
  /** One of DOCUMENT_KINDS. */
  kind: string;
  /** Optional "YYYY-MM-DD" (e.g. an insurance certificate's end date). */
  expiresOn: string;
};

export type MechanicDocumentCommand = { kind: DocumentKind; expiresOn: string | null };

export function mechanicDocumentValuesFromFormData(formData: FormData): MechanicDocumentFormValues {
  return { kind: formText(formData, "kind"), expiresOn: formText(formData, "expiresOn") };
}

export const mechanicDocumentCommandSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  expiresOn: calendarDate().nullable(),
});

export const mechanicDocumentFormSchema = z
  .object({ kind: z.string().default(""), expiresOn: z.string().default("") })
  .transform((values, ctx) => {
    const reader = FormReader.for(ctx);
    const kind = reader.choice(["kind"], values.kind, DOCUMENT_KINDS, "Choose what kind of document this is.");
    const expiresOn = reader.optionalDate(["expiresOn"], values.expiresOn, "Enter a valid expiry date, or leave it empty.");
    return kind === undefined || expiresOn === undefined ? z.NEVER : { kind, expiresOn };
  })
  .pipe(mechanicDocumentCommandSchema);

export function parseMechanicDocumentForm(values: MechanicDocumentFormValues): FormParseResult<MechanicDocumentCommand> {
  return toFormResult(mechanicDocumentFormSchema.safeParse(values));
}
