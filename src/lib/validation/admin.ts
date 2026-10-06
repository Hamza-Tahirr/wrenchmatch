// Zod schemas for the admin dashboard: every admin form (Server Actions parse FormData with
// them) and every list filter (pages parse searchParams with them). The admin domain
// functions in src/server/admin re-validate their typed input with the same schemas, so
// the rules live in one place. Safe for client and server code.
//
// Field names are the form field names. Domain errors raised from these schemas carry
// `details.fieldErrors` keyed the same way (see adminFieldErrors).

import { z } from "zod";

import {
  BOOKING_STATUSES,
  MECHANIC_STATUSES,
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  type MechanicStatus,
} from "@/lib/domain";
import { isValidTimeZone } from "@/lib/time";

import { SUPPORT_STATUSES, SUPPORT_TOPICS } from "./support";

export const ADMIN_REASON_MIN_LENGTH = 3;
export const ADMIN_REASON_MAX_LENGTH = 500;
export const DOCUMENT_NOTE_MAX_LENGTH = 500;
export const SUPPORT_RESOLUTION_MAX_LENGTH = 1000;
export const INVITE_NAME_MAX_LENGTH = 60;
export const INVITE_NOTE_MAX_LENGTH = 500;
export const METRO_LABEL_MAX_LENGTH = 80;
export const CENTROID_CITY_MAX_LENGTH = 80;
export const SEARCH_QUERY_MAX_LENGTH = 100;
/** Insurance expiring within this many days is flagged on the dashboard. */
export const INSURANCE_WARNING_DAYS = 30;
export const MAX_INSURANCE_WINDOW_DAYS = 365;

// ---------------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------------

/** Trims strings; blank strings and null become undefined (an omitted optional field). */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return value;
}

const TRUE_WORDS = new Set(["true", "on", "1", "yes"]);
const FALSE_WORDS = new Set(["false", "off", "0", "no"]);

function toBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const word = value.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return value;
}

/** A yes/no value that must be present: a boolean, or "true"/"false" from a hidden input. */
function requiredBoolean(message: string) {
  return z.preprocess(toBoolean, z.boolean({ error: message }));
}

/** A checkbox: "on" when ticked, absent when not (absent means false). */
const checkboxBoolean = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? false : toBoolean(value)),
  z.boolean({ error: "Tick the box or leave it empty." }),
);

const RECORD_ID_MESSAGE = "This record could not be identified. Refresh the page and try again.";

/** A record id (UUID from newId()). */
export const recordIdSchema = z
  .string({ error: RECORD_ID_MESSAGE })
  .trim()
  .min(1, { error: RECORD_ID_MESSAGE })
  .max(64, { error: RECORD_ID_MESSAGE })
  .regex(/^[0-9A-Za-z-]+$/, { error: RECORD_ID_MESSAGE });

const categoryIdSchema = z
  .string({ error: "Choose a service category." })
  .trim()
  .regex(/^[a-z][a-z_]{0,39}$/, { error: "Choose a service category." });

const ZIP_MESSAGE = "Enter a 5-digit ZIP code.";
/** A US ZIP code (5 digits). */
export const zipCodeSchema = z.string({ error: ZIP_MESSAGE }).trim().regex(/^\d{5}$/, { error: ZIP_MESSAGE });

function requiredText(options: { min: number; max: number; missing: string; tooLong: string }) {
  return z
    .string({ error: options.missing })
    .trim()
    .min(options.min, { error: options.missing })
    .max(options.max, { error: options.tooLong });
}

function optionalText(max: number, tooLong: string) {
  return z.preprocess(blankToUndefined, z.string({ error: tooLong }).max(max, { error: tooLong }).optional());
}

const REASON_TOO_LONG = `Keep the reason to ${ADMIN_REASON_MAX_LENGTH} characters or fewer.`;

function requiredReason(missing: string) {
  return requiredText({
    min: ADMIN_REASON_MIN_LENGTH,
    max: ADMIN_REASON_MAX_LENGTH,
    missing,
    tooLong: REASON_TOO_LONG,
  });
}

const optionalReason = optionalText(ADMIN_REASON_MAX_LENGTH, REASON_TOO_LONG);

const emailSchema = z
  .string({ error: "Enter an email address." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter an email address." })
  .max(254, { error: "Enter an email address of 254 characters or fewer." })
  .pipe(z.email({ error: "Enter a valid email address, like name@example.com." }));

// "Area/Location" names (America/Phoenix, America/Argentina/Buenos_Aires, Etc/GMT+7) or UTC.
// Abbreviations such as "EST" and offsets such as "+07:00" are refused: they are ambiguous
// or ignore daylight saving time.
const IANA_TIME_ZONE = /^(?:UTC|[A-Za-z][A-Za-z_-]*(?:\/[A-Za-z0-9_+-]+)+)$/;

/**
 * The canonical IANA name for `value` (e.g. "america/phoenix" or "US/Arizona" →
 * "America/Phoenix"), or null when it is not a time zone this runtime knows.
 */
export function normalizeTimeZone(value: string): string | null {
  const trimmed = value.trim();
  if (!IANA_TIME_ZONE.test(trimmed) || !isValidTimeZone(trimmed)) return null;
  const resolved = new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
  return IANA_TIME_ZONE.test(resolved) ? resolved : trimmed;
}

const TIME_ZONE_MESSAGE = "Enter an IANA time zone name, such as America/Phoenix or America/New_York.";

const timeZoneSchema = z.string({ error: TIME_ZONE_MESSAGE }).transform((value, ctx) => {
  const normalized = normalizeTimeZone(value);
  if (normalized === null) {
    ctx.addIssue({ code: "custom", message: TIME_ZONE_MESSAGE });
    return z.NEVER;
  }
  return normalized;
});

const cityMessage = "Enter the city for this ZIP code.";
const citySchema = requiredText({
  min: 1,
  max: CENTROID_CITY_MAX_LENGTH,
  missing: cityMessage,
  tooLong: `Keep the city to ${CENTROID_CITY_MAX_LENGTH} characters or fewer.`,
});

const STATE_MESSAGE = "Enter the 2-letter state code, such as AZ.";
const stateSchema = z
  .string({ error: STATE_MESSAGE })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: STATE_MESSAGE });

const LATITUDE_MESSAGE = "Enter the latitude in decimal degrees, between -90 and 90 (e.g. 33.45).";
const LONGITUDE_MESSAGE = "Enter the longitude in decimal degrees, between -180 and 180 (e.g. -112.07).";

function coordinate(min: number, max: number, message: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value),
    z.number({ error: message }).min(min, { error: message }).max(max, { error: message }),
  );
}

const latitudeSchema = coordinate(-90, 90, LATITUDE_MESSAGE);
const longitudeSchema = coordinate(-180, 180, LONGITUDE_MESSAGE);

/**
 * Field errors keyed by form field name: the last named segment of each issue's path, so
 * nested domain input (`centroid.lat`) reports on the form's flat field (`lat`). Issues
 * without a path are keyed "form".
 */
export function adminFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = [...issue.path].reverse().find((segment) => typeof segment === "string") ?? "form";
    const messages = (result[key] ??= []);
    if (!messages.includes(issue.message)) messages.push(issue.message);
  }
  return result;
}

// ---------------------------------------------------------------------------------
// Form state (useActionState and ConfirmDialog)
// ---------------------------------------------------------------------------------

/** Text fields of a submitted form, echoed back after a failure to refill the form. */
export type AdminFormValues = Record<string, string>;

/**
 * The state every admin Server Action returns. A failure carries the message to show
 * (`formError`, which ConfirmDialog displays while staying open), messages per form field
 * and the submitted values (React 19 resets uncontrolled fields after an action). Build
 * failures with adminValidationFailure / adminActionFailure (src/server/admin/action-result.ts).
 */
export type AdminActionState = { ok: true; message?: string } | AdminFailureState;

/** The failure half of every admin form state. */
export type AdminFailureState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  values?: AdminFormValues;
};

/**
 * State of a reveal dialog (revealMechanicPrivate / revealRequestContact): the private
 * details, shown once in the dialog and never cached in the page.
 */
export type AdminRevealState<T> = { ok: true; revealed: T } | AdminFailureState;

/** Initial useActionState value of every admin form and reveal dialog: nothing submitted yet. */
export const INITIAL_ADMIN_ACTION_STATE = { ok: false } as const satisfies AdminFailureState;

/**
 * The text fields of a submitted form, for AdminActionState.values: files and the hidden
 * `$ACTION…` fields React adds are skipped, and a repeated name keeps its first value.
 */
export function adminFormValues(formData: FormData): AdminFormValues {
  const values: AdminFormValues = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || name.startsWith("$ACTION") || Object.hasOwn(values, name)) continue;
    values[name] = value;
  }
  return values;
}

// ---------------------------------------------------------------------------------
// Mechanic review
// ---------------------------------------------------------------------------------

/** Statuses an admin can set (the mechanic re-applies from "rejected" themselves). */
export const ADMIN_MECHANIC_STATUSES = [
  "under_review",
  "approved",
  "rejected",
  "suspended",
] as const satisfies readonly MechanicStatus[];
export type AdminMechanicStatus = (typeof ADMIN_MECHANIC_STATUSES)[number];

/** Statuses that need a reason the mechanic can read (also a CHECK in the schema). */
export const REASON_REQUIRED_MECHANIC_STATUSES: readonly AdminMechanicStatus[] = ["rejected", "suspended"];

export const mechanicStatusChangeSchema = z
  .object({
    mechanicId: recordIdSchema,
    status: z.enum(ADMIN_MECHANIC_STATUSES, { error: "Choose the new status." }),
    reason: optionalReason,
  })
  .superRefine((value, ctx) => {
    if (!REASON_REQUIRED_MECHANIC_STATUSES.includes(value.status)) return;
    if (value.reason !== undefined && value.reason.length >= ADMIN_REASON_MIN_LENGTH) return;
    const verb = value.status === "rejected" ? "rejecting" : "suspending";
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: `Give a reason for ${verb} (at least ${ADMIN_REASON_MIN_LENGTH} characters). The mechanic will see it.`,
    });
  });
export type MechanicStatusChangeFields = z.output<typeof mechanicStatusChangeSchema>;

export const safetyApprovalSchema = z.object({
  mechanicId: recordIdSchema,
  categoryId: categoryIdSchema,
  approved: requiredBoolean("Choose whether to approve this work or remove the approval."),
  /** Optional note for the audit log, e.g. what experience was checked. */
  reason: optionalReason,
});
export type SafetyApprovalFields = z.output<typeof safetyApprovalSchema>;

export const DOCUMENT_REVIEW_STATUSES = ["verified", "rejected"] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

export const documentReviewSchema = z
  .object({
    documentId: recordIdSchema,
    status: z.enum(DOCUMENT_REVIEW_STATUSES, { error: "Choose Verified or Rejected." }),
    note: optionalText(DOCUMENT_NOTE_MAX_LENGTH, `Keep the note to ${DOCUMENT_NOTE_MAX_LENGTH} characters or fewer.`),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "rejected") return;
    if (value.note !== undefined && value.note.length >= ADMIN_REASON_MIN_LENGTH) return;
    ctx.addIssue({
      code: "custom",
      path: ["note"],
      message: `Say why the document was rejected (at least ${ADMIN_REASON_MIN_LENGTH} characters). The mechanic will see it.`,
    });
  });
export type DocumentReviewFields = z.output<typeof documentReviewSchema>;

export const mechanicRevealSchema = z.object({
  mechanicId: recordIdSchema,
  reason: requiredReason(
    `Say why you need this mechanic's private details (at least ${ADMIN_REASON_MIN_LENGTH} characters). It is recorded in the audit log.`,
  ),
});
export type MechanicRevealFields = z.output<typeof mechanicRevealSchema>;

export const inviteMechanicSchema = z.object({
  email: emailSchema,
  name: optionalText(INVITE_NAME_MAX_LENGTH, `Keep the name to ${INVITE_NAME_MAX_LENGTH} characters or fewer.`),
  note: optionalText(INVITE_NOTE_MAX_LENGTH, `Keep the note to ${INVITE_NOTE_MAX_LENGTH} characters or fewer.`),
});
export type InviteMechanicFields = z.output<typeof inviteMechanicSchema>;

export const insuranceWindowSchema = z
  .number({ error: "Choose how many days ahead to look." })
  .int({ error: "Choose a whole number of days." })
  .min(0, { error: "Choose 0 days or more." })
  .max(MAX_INSURANCE_WINDOW_DAYS, { error: `Choose ${MAX_INSURANCE_WINDOW_DAYS} days or fewer.` });

// ---------------------------------------------------------------------------------
// Requests and matching
// ---------------------------------------------------------------------------------

export const requestRevealSchema = z.object({
  requestId: recordIdSchema,
  reason: requiredReason(
    `Say why you need the customer's contact details (at least ${ADMIN_REASON_MIN_LENGTH} characters). It is recorded in the audit log.`,
  ),
});
export type RequestRevealFields = z.output<typeof requestRevealSchema>;

/** The "Re-run matching" button's form (a hidden request id). */
export const rerunMatchingSchema = z.object({ requestId: recordIdSchema });
export type RerunMatchingFields = z.output<typeof rerunMatchingSchema>;

// ---------------------------------------------------------------------------------
// Demo booking interventions
// ---------------------------------------------------------------------------------

export const demoBookingActionSchema = z.object({
  bookingId: recordIdSchema,
  reason: requiredReason(
    `Give a reason (at least ${ADMIN_REASON_MIN_LENGTH} characters). The customer and the mechanic will see it.`,
  ),
});
export type DemoBookingActionFields = z.output<typeof demoBookingActionSchema>;

export const demoPayoutHoldSchema = z.object({
  bookingId: recordIdSchema,
  hold: requiredBoolean("Choose whether to hold or release the payout."),
  reason: requiredReason(
    `Give a reason (at least ${ADMIN_REASON_MIN_LENGTH} characters). The mechanic will see it.`,
  ),
});
export type DemoPayoutHoldFields = z.output<typeof demoPayoutHoldSchema>;

// ---------------------------------------------------------------------------------
// Settings: categories and pilot ZIPs
// ---------------------------------------------------------------------------------

export const categoryToggleSchema = z.object({
  categoryId: categoryIdSchema,
  enabled: requiredBoolean("Choose whether to enable or disable the category."),
  reason: optionalReason,
});
export type CategoryToggleFields = z.output<typeof categoryToggleSchema>;

export const pilotZipToggleSchema = z.object({
  zip: zipCodeSchema,
  enabled: requiredBoolean("Choose whether to enable or disable the ZIP code."),
  reason: optionalReason,
});
export type PilotZipToggleFields = z.output<typeof pilotZipToggleSchema>;

const metroLabelSchema = requiredText({
  min: 1,
  max: METRO_LABEL_MAX_LENGTH,
  missing: "Enter the metro area label customers see, such as Phoenix metro.",
  tooLong: `Keep the label to ${METRO_LABEL_MAX_LENGTH} characters or fewer.`,
});

/** Approximate location of a ZIP that has none on file (no geocoder is used). */
export const zipCentroidSchema = z.object({
  city: citySchema,
  state: stateSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  timeZone: timeZoneSchema,
});
export type ZipCentroidFields = z.output<typeof zipCentroidSchema>;

/** Domain input of upsertPilotZip: the centroid is needed only for a ZIP with no location on file. */
export const pilotZipInputSchema = z.object({
  zip: zipCodeSchema,
  metroLabel: metroLabelSchema,
  enabled: requiredBoolean("Choose whether the ZIP code is enabled."),
  centroid: zipCentroidSchema.optional(),
});
export type PilotZipInputFields = z.output<typeof pilotZipInputSchema>;

/** The location fields of the pilot ZIP form; all or none must be filled in. */
export const CENTROID_FIELDS = ["city", "state", "lat", "lng", "timeZone"] as const;

const CENTROID_FIELD_MESSAGES: Readonly<Record<(typeof CENTROID_FIELDS)[number], string>> = {
  city: cityMessage,
  state: STATE_MESSAGE,
  lat: LATITUDE_MESSAGE,
  lng: LONGITUDE_MESSAGE,
  timeZone: TIME_ZONE_MESSAGE,
};

/**
 * The pilot ZIP form (flat FormData fields: zip, metroLabel, enabled checkbox and the
 * optional location fields city, state, lat, lng, timeZone), producing upsertPilotZip's
 * input. Leave every location field empty for a ZIP that already has a location on file.
 */
export const pilotZipFormSchema = z
  .object({
    zip: zipCodeSchema,
    metroLabel: metroLabelSchema,
    enabled: checkboxBoolean,
    city: z.preprocess(blankToUndefined, z.unknown()),
    state: z.preprocess(blankToUndefined, z.unknown()),
    lat: z.preprocess(blankToUndefined, z.unknown()),
    lng: z.preprocess(blankToUndefined, z.unknown()),
    timeZone: z.preprocess(blankToUndefined, z.unknown()),
  })
  .transform((value, ctx) => {
    const { zip, metroLabel, enabled } = value;
    const entered = CENTROID_FIELDS.filter((field) => value[field] !== undefined);
    if (entered.length === 0) return { zip, metroLabel, enabled, centroid: undefined };

    for (const field of CENTROID_FIELDS) {
      if (value[field] === undefined) {
        ctx.addIssue({ code: "custom", path: [field], message: CENTROID_FIELD_MESSAGES[field] });
      }
    }
    const centroid = zipCentroidSchema.safeParse({
      city: value.city,
      state: value.state,
      lat: value.lat,
      lng: value.lng,
      timeZone: value.timeZone,
    });
    if (!centroid.success) {
      // Missing fields were reported above; add the problems with the ones filled in.
      for (const issue of centroid.error.issues) {
        const field = CENTROID_FIELDS.find((name) => name === issue.path[0]);
        if (field && value[field] !== undefined) {
          ctx.addIssue({ code: "custom", path: [field], message: issue.message });
        }
      }
      return z.NEVER;
    }
    if (entered.length !== CENTROID_FIELDS.length) return z.NEVER;
    return { zip, metroLabel, enabled, centroid: centroid.data };
  });
export type PilotZipFormFields = z.output<typeof pilotZipFormSchema>;

// ---------------------------------------------------------------------------------
// Help desk
// ---------------------------------------------------------------------------------

export const supportResolutionSchema = z.object({
  supportRequestId: recordIdSchema,
  resolutionNote: requiredText({
    min: ADMIN_REASON_MIN_LENGTH,
    max: SUPPORT_RESOLUTION_MAX_LENGTH,
    missing: `Write the resolution (at least ${ADMIN_REASON_MIN_LENGTH} characters). The person who asked will see it.`,
    tooLong: `Keep the resolution to ${SUPPORT_RESOLUTION_MAX_LENGTH} characters or fewer.`,
  }),
});
export type SupportResolutionFields = z.output<typeof supportResolutionSchema>;

// ---------------------------------------------------------------------------------
// List filters (URL search params or typed filters). Lenient: an unknown or malformed
// value is dropped (the list shows everything) instead of failing the page.
// ---------------------------------------------------------------------------------

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

const pageParam = z
  .preprocess((value) => {
    const first = firstValue(value);
    if (first === undefined || first === null || first === "") return 1;
    return typeof first === "string" && /^\d{1,6}$/.test(first.trim()) ? Number(first.trim()) : first;
  }, z.number().int().min(1).max(1_000_000))
  .catch(1);

function enumParam<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => blankToUndefined(firstValue(value)), z.enum(values).optional()).catch(undefined);
}

function textParam(max: number) {
  return z.preprocess((value) => blankToUndefined(firstValue(value)), z.string().max(max).optional()).catch(undefined);
}

const flagParam = z
  .preprocess((value) => {
    const first = firstValue(value);
    if (first === undefined || first === null || first === "") return false;
    return toBoolean(first);
  }, z.boolean())
  .catch(false);

/** Mechanic list filter: a status, or "awaiting_review" (applied and under review). */
export const MECHANIC_LIST_FILTERS = [...MECHANIC_STATUSES, "awaiting_review"] as const;
export type MechanicListFilter = (typeof MECHANIC_LIST_FILTERS)[number];

export const mechanicListQuerySchema = z.object({
  status: enumParam(MECHANIC_LIST_FILTERS),
  /** Matches the display name or account email. */
  query: textParam(SEARCH_QUERY_MAX_LENGTH),
});
export type MechanicListQuery = z.output<typeof mechanicListQuerySchema>;

/** Request list filter: a status, or "active" (open and quoted). Drafts show only with "draft". */
export const REQUEST_LIST_FILTERS = [...REQUEST_STATUSES, "active"] as const;
export type RequestListFilter = (typeof REQUEST_LIST_FILTERS)[number];

export const requestListQuerySchema = z.object({
  status: enumParam(REQUEST_LIST_FILTERS),
  /** Only requests no mechanic was notified about. */
  zeroMatchesOnly: flagParam,
  page: pageParam,
});
export type RequestListQuery = z.output<typeof requestListQuerySchema>;

export const quoteListQuerySchema = z.object({
  status: enumParam(QUOTE_STATUSES),
  page: pageParam,
});
export type QuoteListQuery = z.output<typeof quoteListQuerySchema>;

export const bookingListQuerySchema = z.object({
  status: enumParam(BOOKING_STATUSES),
  /** Only bookings that were confirmed (jobs past the reservation; the ones admins can act on). */
  bookedOnly: flagParam,
  page: pageParam,
});
export type BookingListQuery = z.output<typeof bookingListQuerySchema>;

export const reviewListQuerySchema = z.object({ page: pageParam });
export type ReviewListQuery = z.output<typeof reviewListQuerySchema>;

export const supportListQuerySchema = z.object({
  status: enumParam(SUPPORT_STATUSES),
  /** One topic only, e.g. "account" (sign-in, profile and account-deletion requests). */
  topic: enumParam(SUPPORT_TOPICS),
  page: pageParam,
});
export type SupportListQuery = z.output<typeof supportListQuerySchema>;

export const auditListQuerySchema = z.object({
  entityType: textParam(40),
  action: textParam(80),
  page: pageParam,
});
export type AuditListQuery = z.output<typeof auditListQuerySchema>;

export const mailboxListQuerySchema = z.object({
  template: textParam(60),
  page: pageParam,
});
export type MailboxListQuery = z.output<typeof mailboxListQuerySchema>;
