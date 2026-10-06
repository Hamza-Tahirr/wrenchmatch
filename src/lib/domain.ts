// Domain constants, status labels and consent copy shared by client and server code.
// Tuples are `as const` so they can feed z.enum(...) and derive union types. Values match
// the CHECK constraints in db/migrations/0001_init.sql.

export const USER_ROLES = ["customer", "mechanic", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusInfo = { readonly label: string; readonly tone: BadgeTone };

// ---------------------------------------------------------------------------------
// Vehicles and service preferences
// ---------------------------------------------------------------------------------

/** Common US-market makes, alphabetical. Matching compares makes by exact value. */
export const VEHICLE_MAKES = [
  "Acura",
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Fiat",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Mazda",
  "Mercedes-Benz",
  "Mercury",
  "MINI",
  "Mitsubishi",
  "Nissan",
  "Pontiac",
  "Porsche",
  "Ram",
  "Scion",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;
export type VehicleMake = (typeof VEHICLE_MAKES)[number];

export const PREFERRED_WINDOWS = ["morning", "afternoon", "evening", "flexible"] as const;
export type PreferredWindow = (typeof PREFERRED_WINDOWS)[number];

export type PreferredWindowInfo = {
  readonly label: string;
  /** e.g. "8 AM–12 PM" */
  readonly hours: string;
  /** Minutes from local midnight; null for "flexible" (any window that week). */
  readonly startMinute: number | null;
  readonly endMinute: number | null;
};

export const PREFERRED_WINDOW_INFO: Readonly<Record<PreferredWindow, PreferredWindowInfo>> = {
  morning: { label: "Morning", hours: "8 AM–12 PM", startMinute: 480, endMinute: 720 },
  afternoon: { label: "Afternoon", hours: "12 PM–5 PM", startMinute: 720, endMinute: 1020 },
  evening: { label: "Evening", hours: "5 PM–8 PM", startMinute: 1020, endMinute: 1200 },
  flexible: { label: "Flexible", hours: "Any time that week", startMinute: null, endMinute: null },
};

export type OptionInfo = { readonly label: string; readonly description: string };

/** How the customer wants the work done (repair_requests.service_mode). */
export const REQUEST_SERVICE_MODES = ["mobile", "garage", "either"] as const;
export type RequestServiceMode = (typeof REQUEST_SERVICE_MODES)[number];
export const REQUEST_SERVICE_MODE_INFO: Readonly<Record<RequestServiceMode, OptionInfo>> = {
  mobile: { label: "Mobile - come to me", description: "A mechanic comes to your location." },
  garage: { label: "I'll visit a garage", description: "You take the car to the mechanic's garage." },
  either: { label: "Either", description: "Mobile or garage, whichever a nearby mechanic offers." },
};

/** What a mechanic offers (mechanic_profiles.service_mode). */
export const MECHANIC_SERVICE_MODES = ["mobile", "garage", "both"] as const;
export type MechanicServiceMode = (typeof MECHANIC_SERVICE_MODES)[number];
export const MECHANIC_SERVICE_MODE_INFO: Readonly<Record<MechanicServiceMode, OptionInfo>> = {
  mobile: { label: "Mobile only", description: "You travel to customers within your travel radius." },
  garage: { label: "Garage only", description: "Customers bring their car to your garage." },
  both: { label: "Mobile and garage", description: "You offer both, job by job." },
};

/** Where a quoted job happens (quotes.service_mode / bookings.service_mode). */
export const QUOTE_SERVICE_MODES = ["mobile", "garage"] as const;
export type QuoteServiceMode = (typeof QUOTE_SERVICE_MODES)[number];
export const QUOTE_SERVICE_MODE_INFO: Readonly<Record<QuoteServiceMode, OptionInfo>> = {
  mobile: { label: "Mobile", description: "The mechanic comes to the customer's location." },
  garage: { label: "At the garage", description: "The customer takes the car to the mechanic's garage." },
};

/** Maximum distance (miles) a customer will drive to a garage. */
export const GARAGE_DISTANCE_OPTIONS = [5, 10, 15, 25] as const;
export type GarageDistanceMiles = (typeof GARAGE_DISTANCE_OPTIONS)[number];
export const DEFAULT_GARAGE_DISTANCE_MILES: GarageDistanceMiles = 15;

// ---------------------------------------------------------------------------------
// Statuses (state machines in ARCHITECTURE section 5)
// ---------------------------------------------------------------------------------

export const REQUEST_STATUSES = [
  "draft",
  "open",
  "quoted",
  "reserved",
  "booked",
  "expired",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_INFO: Readonly<Record<RequestStatus, StatusInfo>> = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Waiting for quotes", tone: "info" },
  quoted: { label: "Quotes received", tone: "info" },
  reserved: { label: "Reserved (payment pending)", tone: "warning" },
  booked: { label: "Booked", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const QUOTE_STATUSES = ["submitted", "withdrawn", "expired", "selected", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_INFO: Readonly<Record<QuoteStatus, StatusInfo>> = {
  submitted: { label: "Submitted", tone: "info" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  selected: { label: "Selected", tone: "success" },
  declined: { label: "Not selected", tone: "neutral" },
};

export const BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_INFO: Readonly<Record<BookingStatus, StatusInfo>> = {
  pending_payment: { label: "Pending payment", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  disputed: { label: "Disputed", tone: "danger" },
};

export const MECHANIC_STATUSES = [
  "applied",
  "under_review",
  "approved",
  "rejected",
  "suspended",
] as const;
export type MechanicStatus = (typeof MECHANIC_STATUSES)[number];
export const MECHANIC_STATUS_INFO: Readonly<Record<MechanicStatus, StatusInfo>> = {
  applied: { label: "Applied", tone: "info" },
  under_review: { label: "Under review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

export const CHANGE_ORDER_STATUSES = ["proposed", "approved", "rejected", "void"] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];
export const CHANGE_ORDER_STATUS_INFO: Readonly<Record<ChangeOrderStatus, StatusInfo>> = {
  proposed: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  void: { label: "Void", tone: "neutral" },
};

export const DOCUMENT_STATUSES = ["pending", "verified", "rejected"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_INFO: Readonly<Record<DocumentStatus, StatusInfo>> = {
  pending: { label: "Pending review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

/** A mechanic's relationship to a matched job (job_matches.status). */
export const JOB_MATCH_STATUSES = ["notified", "interested", "quoted", "passed"] as const;
export type JobMatchStatus = (typeof JOB_MATCH_STATUSES)[number];
export const JOB_MATCH_STATUS_INFO: Readonly<Record<JobMatchStatus, StatusInfo>> = {
  notified: { label: "New", tone: "info" },
  interested: { label: "Interested", tone: "info" },
  quoted: { label: "Quoted", tone: "success" },
  passed: { label: "Passed", tone: "neutral" },
};

/** bookings.payout_status; anything but not_eligible exists only on demo fixtures. */
export const PAYOUT_STATUSES = ["not_eligible", "pending", "sent", "failed", "held"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const PAYOUT_STATUS_INFO: Readonly<Record<PayoutStatus, StatusInfo>> = {
  not_eligible: { label: "Not eligible yet (online payments coming soon)", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  held: { label: "On hold", tone: "warning" },
};

// ---------------------------------------------------------------------------------
// Matching reason codes (ARCHITECTURE section 6). A mechanic is eligible only with none.
// ---------------------------------------------------------------------------------

export const MATCH_REASONS = [
  "status_not_approved",
  "suspended",
  "not_accepting_jobs",
  "insurance_missing",
  "insurance_expired",
  "category_not_offered",
  "safety_category_not_approved",
  "make_not_supported",
  "mode_mismatch",
  "out_of_range",
  "no_availability",
] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

/** Admin-facing explanations for the matching diagnostics screen. */
export const MATCH_REASON_INFO: Readonly<Record<MatchReason, { label: string; explanation: string }>> = {
  status_not_approved: {
    label: "Not approved",
    explanation: "The mechanic's application is not approved (applied, under review or rejected).",
  },
  suspended: {
    label: "Suspended",
    explanation: "The mechanic is suspended and receives no new jobs.",
  },
  not_accepting_jobs: {
    label: "Not accepting jobs",
    explanation: "The mechanic has paused new jobs on their profile.",
  },
  insurance_missing: {
    label: "No insurance on file",
    explanation: "No insurance provider or expiry date is recorded for this mechanic.",
  },
  insurance_expired: {
    label: "Insurance expired",
    explanation: "The recorded insurance has expired or expires before the preferred date.",
  },
  category_not_offered: {
    label: "Service not offered",
    explanation: "The mechanic does not offer this service category.",
  },
  safety_category_not_approved: {
    label: "Not approved for safety work",
    explanation:
      "This category is safety-sensitive (brakes or suspension) and an admin has not approved this mechanic for it.",
  },
  make_not_supported: {
    label: "Make not serviced",
    explanation: "The mechanic does not service this vehicle make.",
  },
  mode_mismatch: {
    label: "Service mode mismatch",
    explanation: "The request needs mobile or garage service that this mechanic does not offer.",
  },
  out_of_range: {
    label: "Out of range",
    explanation:
      "Too far: beyond the mechanic's travel radius (mobile) or the customer's maximum garage distance (garage). Distances are approximate, between ZIP centroids.",
  },
  no_availability: {
    label: "No matching availability",
    explanation:
      "None of the mechanic's weekly availability windows overlaps the preferred day and time window.",
  },
};

// ---------------------------------------------------------------------------------
// Mechanic documents
// ---------------------------------------------------------------------------------

export const DOCUMENT_KINDS = ["id_document", "insurance", "certification", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_INFO: Readonly<Record<DocumentKind, OptionInfo>> = {
  id_document: { label: "Photo ID", description: "Driver's license or other government photo ID." },
  insurance: {
    label: "Insurance certificate",
    description: "Proof of liability insurance showing the provider and expiry date.",
  },
  certification: {
    label: "Certification",
    description: "A relevant certification, such as an ASE certificate.",
  },
  other: { label: "Other document", description: "Anything else that supports your application." },
};

// ---------------------------------------------------------------------------------
// Consent copy. The exact text and version are stored in snapshots with a timestamp.
// ---------------------------------------------------------------------------------

export const CONSENT_VERSION = "2026-10-05";

export type ConsentItem = { readonly key: string; readonly text: string };

export const REQUEST_CONSENTS = [
  {
    key: "terms_privacy",
    text: "I agree to the Terms of Service and Privacy Notice (pilot draft).",
  },
  {
    key: "estimate_ack",
    text: "I understand quotes are estimates for the problem I describe. If a mechanic finds a hidden fault, any extra work needs a new estimate that I approve first.",
  },
  {
    key: "contact_sharing",
    text: "I understand my phone, email and exact address are shared only with the mechanic I book, and only after the booking is confirmed.",
  },
] as const satisfies readonly ConsentItem[];
export type RequestConsentKey = (typeof REQUEST_CONSENTS)[number]["key"];

export const BOOKING_CONSENTS = [
  {
    key: "quote_terms",
    text: "I accept this itemized estimate and the scope the mechanic described.",
  },
  {
    key: "cancellation_policy",
    text: "I have read the provisional cancellation policy.",
  },
  {
    key: "payment_pending_ack",
    text: "I understand online payments are coming soon, so this reservation stays pending and is not yet a confirmed booking.",
  },
] as const satisfies readonly ConsentItem[];
export type BookingConsentKey = (typeof BOOKING_CONSENTS)[number]["key"];

export type ConsentSnapshot = {
  version: string;
  acceptedAt: string;
  items: { key: string; text: string }[];
};

/** The record stored in *_consent_snapshot_json: the exact text accepted, its version and when. */
export function buildConsentSnapshot(
  items: readonly ConsentItem[],
  acceptedAtIso: string,
): ConsentSnapshot {
  return {
    version: CONSENT_VERSION,
    acceptedAt: acceptedAtIso,
    items: items.map((item) => ({ key: item.key, text: item.text })),
  };
}
