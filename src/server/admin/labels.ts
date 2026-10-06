import "server-only";

import { DOCUMENT_KIND_INFO, DOCUMENT_KINDS } from "@/lib/domain";
import { SUPPORT_TOPIC_INFO, SUPPORT_TOPICS } from "@/lib/validation/support";

import type { JsonObject } from "./types";

// Human labels for audit actions and audited entity types, plus admin links to audited
// records. Actions recorded by other modules are labelled here too; an action this build
// does not know falls back to a readable version of its name.

/** Audit actions written by the admin commands in this folder. */
export const ADMIN_AUDIT_ACTIONS = {
  mechanicReviewStarted: "mechanic.review_started",
  mechanicApproved: "mechanic.approved",
  mechanicReinstated: "mechanic.reinstated",
  mechanicRejected: "mechanic.rejected",
  mechanicSuspended: "mechanic.suspended",
  safetyApprovalGranted: "mechanic.safety_approval_granted",
  safetyApprovalRemoved: "mechanic.safety_approval_removed",
  documentVerified: "mechanic_document.verified",
  documentRejected: "mechanic_document.rejected",
  mechanicPrivateRevealed: "mechanic.private_revealed",
  mechanicInvited: "mechanic.invited",
  requestContactRevealed: "request.contact_revealed",
  matchingRerun: "request.matching_rerun",
  demoBookingCancelled: "booking.demo_cancelled",
  demoBookingDisputed: "booking.demo_disputed",
  demoPayoutHeld: "booking.demo_payout_held",
  demoPayoutReleased: "booking.demo_payout_released",
  categoryEnabled: "category.enabled",
  categoryDisabled: "category.disabled",
  pilotZipAdded: "pilot_zip.added",
  pilotZipUpdated: "pilot_zip.updated",
  pilotZipEnabled: "pilot_zip.enabled",
  pilotZipDisabled: "pilot_zip.disabled",
  supportRequestResolved: "support_request.resolved",
} as const;

const ACTION_LABELS: Readonly<Record<string, string>> = {
  // admin (this folder)
  "mechanic.review_started": "Application review started",
  "mechanic.approved": "Mechanic approved",
  "mechanic.reinstated": "Mechanic reinstated",
  "mechanic.rejected": "Application rejected",
  "mechanic.suspended": "Mechanic suspended",
  "mechanic.safety_approval_granted": "Safety-sensitive work approved",
  "mechanic.safety_approval_removed": "Safety-sensitive approval removed",
  "mechanic_document.verified": "Document verified",
  "mechanic_document.rejected": "Document rejected",
  "mechanic.private_revealed": "Mechanic private details revealed",
  "mechanic.invited": "Mechanic invited",
  "request.contact_revealed": "Customer contact details revealed",
  "request.matching_rerun": "Matching re-run",
  "booking.demo_cancelled": "Booking cancelled by an admin",
  "booking.demo_disputed": "Booking marked disputed",
  "booking.demo_payout_held": "Payout put on hold",
  "booking.demo_payout_released": "Payout released",
  "category.enabled": "Category enabled",
  "category.disabled": "Category disabled",
  "pilot_zip.added": "Pilot ZIP added",
  "pilot_zip.updated": "Pilot ZIP updated",
  "pilot_zip.enabled": "Pilot ZIP enabled",
  "pilot_zip.disabled": "Pilot ZIP disabled",
  "support_request.resolved": "Help request resolved",
  // accounts, files and help requests
  "account.signup": "Account created",
  "mechanic_document.view": "Document viewed",
  "support_request.create": "Help request opened",
  // mechanics (their application and profile)
  "mechanic.apply": "Application submitted",
  "mechanic.resubmit": "Application resubmitted",
  "mechanic.profile_update": "Profile updated",
  "mechanic.services_update": "Services and makes updated",
  "mechanic.availability_update": "Availability updated",
  "mechanic.pause_jobs": "New jobs paused",
  "mechanic.resume_jobs": "New jobs resumed",
  "mechanic.profile_photo_replace": "Profile photo changed",
  "mechanic_document.add": "Document uploaded",
  // the marketplace
  "request.submit": "Request submitted",
  "request.cancel": "Request cancelled",
  "quote.submit": "Quote sent",
  "quote.withdraw": "Quote withdrawn",
  "quote.select": "Quote selected (reservation created)",
  "booking.cancel": "Reservation cancelled",
  "booking.demo_fixture_created": "Booking loaded from sample data (no online payment)",
  "booking.start": "Job started",
  "booking.complete": "Job completed",
  "change_order.propose": "Change order proposed",
  "change_order.withdraw": "Change order withdrawn",
  "change_order.approve": "Change order approved",
  "change_order.reject": "Change order declined",
  "invoice.issue": "Invoice issued",
  "review.submit": "Review left",
  // pictures people add themselves (src/server/media)
  "account.avatar_set": "Profile picture changed",
  "account.avatar_remove": "Profile picture removed",
  "mechanic.gallery_add": "Work photos added",
  "mechanic.gallery_caption": "Work photo caption edited",
  "mechanic.gallery_remove": "Work photo removed",
  "mechanic.gallery_reorder": "Work photos reordered",
  "request.photos_add": "Request photos added",
  "booking.photos_add": "Job photos added",
  "booking.photo_remove": "Job photo removed",
};

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  mechanic: "Mechanic",
  mechanic_document: "Mechanic document",
  request: "Repair request",
  quote: "Quote",
  booking: "Booking",
  change_order: "Change order",
  invoice: "Invoice",
  review: "Review",
  category: "Service category",
  pilot_zip: "Pilot ZIP",
  support_request: "Help request",
  email: "Email",
  user: "Account",
  file: "File",
};

/** "mechanic.approved" → "Mechanic approved"; unknown actions are made readable. */
export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanize(action);
}

// Stored action names stay as recorded (the log is append-only), but the admin pages show
// and filter them by a presentation code: some internal names describe seeded test data in
// words the presented app never uses (ARCHITECTURE section 11, presentation mode).
const ACTION_CODES: Readonly<Record<string, string>> = {
  "booking.demo_cancelled": "booking.admin_cancelled",
  "booking.demo_disputed": "booking.admin_disputed",
  "booking.demo_payout_held": "booking.payout_held",
  "booking.demo_payout_released": "booking.payout_released",
  "booking.demo_fixture_created": "booking.sample_loaded",
};

/** The code shown for (and used to filter by) a stored action: "booking.demo_disputed" → "booking.admin_disputed". */
export function auditActionCode(action: string): string {
  return ACTION_CODES[action] ?? action.replace(/demo/gi, "sample");
}

/** Stored actions (from `known`) shown under the given code; an unknown code matches nothing. */
export function auditActionsForCode(code: string, known: readonly string[]): string[] {
  return known.filter((action) => auditActionCode(action) === code);
}

export function auditEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humanize(entityType);
}

/** What audit-items.ts looked up about an event's record. */
export type AuditEntityNameInput = {
  entityType: string;
  entityId: string | null;
  /** Display name, repair summary, category name or help-request topic (see audit-items.ts). */
  relatedName: string | null;
  documentKind: string | null;
  metadata: JsonObject;
};

/**
 * Which record an event is about, in words: "Alex K.", "Photo ID (Alex K.)",
 * "2017 Honda Accord · Brake work", "Wipers", "ZIP 85004", "Problem with a booking",
 * "Invitation to r***@example.com". Null when the record can't be named (or is gone).
 */
export function auditEntityName({ entityType, entityId, relatedName, documentKind, metadata }: AuditEntityNameInput): string | null {
  switch (entityType) {
    case "mechanic_document": {
      const kind = DOCUMENT_KINDS.find((candidate) => candidate === documentKind);
      if (!kind) return relatedName;
      const label = DOCUMENT_KIND_INFO[kind].label;
      return relatedName ? `${label} (${relatedName})` : label;
    }
    case "support_request": {
      const topic = SUPPORT_TOPICS.find((candidate) => candidate === relatedName);
      return topic ? SUPPORT_TOPIC_INFO[topic].label : null;
    }
    case "pilot_zip":
      return entityId ? `ZIP ${entityId}` : null;
    case "email": {
      const invitee = metadataId(metadata, "invitee");
      return invitee ? `Invitation to ${invitee}` : null;
    }
    default:
      return relatedName;
  }
}

function humanize(name: string): string {
  const words = name
    .replace(/[._]+/g, " ")
    .replace(/\bdemo\b/gi, "sample")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

function metadataId(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const adminPath = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

/** Records an audit event is about, resolved from the database (see audit-items.ts). */
export type AuditRelatedIds = {
  /** The repair request behind a request, quote, booking, change order, invoice or review. */
  requestId: string | null;
  /** The mechanic behind a mechanic, mechanic document or mechanic account event. */
  mechanicId: string | null;
};

const MARKETPLACE_ENTITIES = new Set(["request", "quote", "booking", "change_order", "invoice", "review"]);

/** The admin page that shows an audited record, when there is one. */
export function auditEntityHref(entityType: string, related: AuditRelatedIds, metadata: JsonObject): string | null {
  switch (entityType) {
    case "mechanic":
    case "mechanic_document":
    case "user": {
      const mechanicId = related.mechanicId ?? (entityType === "user" ? null : metadataId(metadata, "mechanicId"));
      return mechanicId ? adminPath("/admin/mechanics", mechanicId) : null;
    }
    case "support_request":
      return "/admin/support";
    case "category":
    case "pilot_zip":
      return "/admin/settings";
    case "email":
      return "/admin/mailbox";
    default: {
      if (!MARKETPLACE_ENTITIES.has(entityType)) return null;
      const requestId = related.requestId ?? metadataId(metadata, "requestId");
      if (requestId) return adminPath("/admin/requests", requestId);
      return entityType === "request" ? null : "/admin/marketplace";
    }
  }
}

/** "jordan@example.com" → "j***@example.com": enough to recognise, for audit metadata. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
