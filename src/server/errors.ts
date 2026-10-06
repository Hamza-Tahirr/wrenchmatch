import "server-only";

export const DOMAIN_ERROR_CODES = [
  "not_found", // also "exists but you may not see it", so ids cannot be probed
  "forbidden",
  "invalid_input",
  "conflict",
  "slot_conflict",
  "quote_expired",
  "mechanic_not_eligible",
  "payment_not_connected",
  "rate_limited",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainErrorDetails = Readonly<Record<string, unknown>>;

/**
 * An expected failure of a domain command. `userMessage` is safe to show to the person
 * who made the request; it never contains another user's private data.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly userMessage: string;
  readonly details?: DomainErrorDetails;

  constructor(code: DomainErrorCode, userMessage: string, details?: DomainErrorDetails) {
    super(userMessage);
    this.name = "DomainError";
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

type Mapping = readonly [DomainErrorCode, string];

// Messages raised by RAISE(ABORT, '...') in db/migrations. Keep in sync with new triggers.
const TRIGGER_ERRORS: Readonly<Record<string, Mapping>> = {
  role_immutable: ["forbidden", "An account's role can't be changed."],
  slot_conflict: [
    "slot_conflict",
    "That time overlaps another quote or booking on your schedule. Choose a different time.",
  ],
  payment_not_connected: [
    "payment_not_connected",
    "Online payments are coming soon, so a pending reservation can't be confirmed or started yet.",
  ],
  booking_must_start_pending_payment: [
    "payment_not_connected",
    "New reservations start as pending payment until online payments launch.",
  ],
  payout_not_connected: ["payment_not_connected", "Payouts start when online payments launch."],
  booking_does_not_match_quote: [
    "conflict",
    "The reservation doesn't match the selected quote. Refresh the page and try again.",
  ],
  request_status_requires_booking: [
    "conflict",
    "This request can't be marked reserved or booked without a matching reservation.",
  ],
  insurance_required_for_approval: [
    "mechanic_not_eligible",
    "Record the mechanic's insurance provider and expiry date before approving.",
  ],
  review_requires_completed_booking: [
    "conflict",
    "A review can only be left by the customer of a completed booking.",
  ],
  change_order_requires_active_booking: [
    "conflict",
    "Change orders can only be proposed on a confirmed or in-progress booking.",
  ],
  invoice_requires_completed_booking: [
    "conflict",
    "An invoice can only be issued after the job is completed.",
  ],
  audit_append_only: ["forbidden", "Audit records can't be changed or deleted."],
  invalid_mechanic_status_transition: [
    "conflict",
    "The mechanic's status can't change that way from its current status. Refresh to see the latest.",
  ],
  invalid_request_transition: [
    "conflict",
    "This request's status has changed. Refresh to see the latest.",
  ],
  invalid_quote_transition: [
    "conflict",
    "This quote is no longer open: it may have expired, been withdrawn or been selected. Refresh to see the latest.",
  ],
  invalid_booking_transition: [
    "conflict",
    "This booking can't move to that status from its current status. Refresh to see the latest.",
  ],
  invalid_change_order_transition: [
    "conflict",
    "This change order has already been decided. Refresh to see the latest.",
  ],
  quote_terms_immutable: [
    "conflict",
    "A sent quote can't be edited. Withdraw it and send a new quote instead.",
  ],
  quote_items_immutable: ["conflict", "Quote line items can't be edited after the quote is sent."],
  booking_snapshot_immutable: [
    "conflict",
    "A reservation's price, time and quote snapshot can't be changed.",
  ],
  change_order_terms_immutable: [
    "conflict",
    "A change order can't be edited after it is proposed. Void it and propose a new one.",
  ],
  invoice_immutable: ["conflict", "An issued invoice can't be edited."],
};

// Keyed by the column list SQLite reports in "UNIQUE constraint failed: <columns>".
const UNIQUE_ERRORS: Readonly<Record<string, Mapping>> = {
  "bookings.request_id": ["conflict", "This request already has a reservation."],
  "bookings.quote_id": ["conflict", "This quote has already been reserved."],
  // partial unique index quotes_one_active_per_mechanic
  "quotes.request_id, quotes.mechanic_id": [
    "conflict",
    "You already have an active quote on this request. Withdraw it before sending a new one.",
  ],
  "users.email": ["conflict", "An account with this email already exists."],
  "reviews.booking_id": ["conflict", "A review has already been left for this booking."],
  "invoices.booking_id": ["conflict", "An invoice has already been issued for this booking."],
};

const UNIQUE_PREFIX = "UNIQUE constraint failed: ";

export type SqliteFailure = {
  /** The most specific result code known, e.g. "SQLITE_CONSTRAINT_TRIGGER". */
  code: string;
  /** SQLite's own message: a trigger's RAISE text, "UNIQUE constraint failed: users.email", ... */
  message: string;
};

// What @libsql/client puts in front of SQLite's message: the result code (twice for a
// statement in a batch or transaction) and, from Turso, "SQLite error: ".
const DRIVER_PREFIXES = /^(?:SQLITE_[A-Z_]+:\s*|SQLite error:\s*)+/;

/** The extended code of a primary SQLITE_CONSTRAINT, read from SQLite's message. */
function constraintCode(message: string): string {
  if (message.startsWith(UNIQUE_PREFIX)) return "SQLITE_CONSTRAINT_UNIQUE";
  if (message.startsWith("FOREIGN KEY constraint failed")) return "SQLITE_CONSTRAINT_FOREIGNKEY";
  if (message.startsWith("NOT NULL constraint failed")) return "SQLITE_CONSTRAINT_NOTNULL";
  if (message.startsWith("CHECK constraint failed")) return "SQLITE_CONSTRAINT_CHECK";
  // The RAISE(ABORT, '...') messages in db/migrations are all snake_case.
  if (/^[a-z_]+$/.test(message)) return "SQLITE_CONSTRAINT_TRIGGER";
  return "SQLITE_CONSTRAINT";
}

/**
 * The SQLite failure behind a driver error, or null for anything else. better-sqlite3 throws
 * `code: "SQLITE_CONSTRAINT_TRIGGER"` with SQLite's message ("role_immutable"). @libsql/client
 * throws LibsqlError with the primary code ("SQLITE_CONSTRAINT"), the extended one in
 * `extendedCode` when the engine runs in this process (a `file:` URL; Turso sends none), and a
 * prefixed message ("SQLITE_CONSTRAINT: SQLite error: role_immutable").
 */
export function readSqliteFailure(error: unknown): SqliteFailure | null {
  if (!(error instanceof Error)) return null;
  const { code, extendedCode } = error as Error & { code?: unknown; extendedCode?: unknown };
  if (typeof code !== "string" || !code.startsWith("SQLITE_")) return null;
  const message = error.message.replace(DRIVER_PREFIXES, "");
  if (typeof extendedCode === "string" && extendedCode.startsWith("SQLITE_")) return { code: extendedCode, message };
  return { code: code === "SQLITE_CONSTRAINT" ? constraintCode(message) : code, message };
}

/**
 * Converts a SQLite failure that encodes a business rule (a trigger's RAISE message or a
 * meaningful UNIQUE constraint) into a DomainError with a friendly message, from either
 * driver (better-sqlite3 or libSQL). A DomainError passes through unchanged. Anything else is
 * **rethrown unchanged**, so the usual call is `catch (e) { throw mapDbError(e); }`.
 * `details.dbReason` holds the trigger message or constraint columns for callers that need
 * to tell cases apart.
 */
export function mapDbError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const failure = readSqliteFailure(error);
  if (!failure) throw error;

  if (failure.code === "SQLITE_CONSTRAINT_TRIGGER") {
    const reason = failure.message;
    const known = TRIGGER_ERRORS[reason];
    if (known) return new DomainError(known[0], known[1], { dbReason: reason });
    if (/^invalid_[a-z_]+_transition$/.test(reason)) {
      return new DomainError(
        "conflict",
        "This record's status has changed. Refresh to see the latest.",
        { dbReason: reason },
      );
    }
    if (/^[a-z_]+_immutable$/.test(reason)) {
      return new DomainError("conflict", "This record can't be changed.", { dbReason: reason });
    }
    throw error;
  }

  if (
    (failure.code === "SQLITE_CONSTRAINT_UNIQUE" || failure.code === "SQLITE_CONSTRAINT_PRIMARYKEY") &&
    failure.message.startsWith(UNIQUE_PREFIX)
  ) {
    const columns = failure.message.slice(UNIQUE_PREFIX.length);
    const known = UNIQUE_ERRORS[columns];
    if (known) return new DomainError(known[0], known[1], { dbReason: columns });
    throw error;
  }

  if (failure.code.startsWith("SQLITE_BUSY")) {
    return new DomainError(
      "conflict",
      "Another change was being saved at the same moment. Please try again.",
      { dbReason: failure.code },
    );
  }

  throw error;
}
