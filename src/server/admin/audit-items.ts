import "server-only";

import { sql, type Kysely } from "kysely";

import { USER_ROLES, type UserRole } from "@/lib/domain";
import type { DB } from "@/server/db/schema.generated";

import { auditActionCode, auditActionLabel, auditEntityHref, auditEntityLabel, auditEntityName } from "./labels";
import { oneOf, parseJsonObject, type JsonObject } from "./types";

// Audit events as the admin sees them: who did what to which record, when and why. Shared
// by the dashboard, a mechanic's history and the audit log.

export type AuditActorRole = UserRole | "system";

export type AuditEventItem = {
  id: string;
  /** UTC ISO timestamp. */
  createdAt: string;
  /** As stored, e.g. "mechanic.approved" (internal: show actionCode). */
  action: string;
  /** The code admins see and filter by (auditActionCode), e.g. "mechanic.approved". */
  actionCode: string;
  /** e.g. "Mechanic approved" */
  actionLabel: string;
  entityType: string;
  /** The kind of record, e.g. "Mechanic", "Repair request". */
  entityLabel: string;
  /** Which record, when it can be named: "Alex K.", "Photo ID (Alex K.)", "2017 Honda Accord · Brake work". */
  entityName: string | null;
  entityId: string | null;
  /** The admin page showing the record (a request's page for its quotes and bookings), when there is one. */
  entityHref: string | null;
  reason: string | null;
  /** "System" for automatic events. */
  actor: { id: string | null; displayName: string; role: AuditActorRole };
  /** Structured context recorded with the event (never contact details). */
  metadata: JsonObject;
};

const ACTOR_ROLES: readonly AuditActorRole[] = [...USER_ROLES, "system"];

// The repair request and the mechanic an event is about, looked up by the event's entity so
// that events recorded by any module link to the right admin page. Primary-key lookups only.
const RELATED_REQUEST_ID = sql<string | null>`(CASE a.entity_type
  WHEN 'request' THEN (SELECT r.id FROM repair_requests AS r WHERE r.id = a.entity_id)
  WHEN 'quote' THEN (SELECT q.request_id FROM quotes AS q WHERE q.id = a.entity_id)
  WHEN 'booking' THEN (SELECT b.request_id FROM bookings AS b WHERE b.id = a.entity_id)
  WHEN 'change_order' THEN (SELECT b.request_id FROM change_orders AS co
    JOIN bookings AS b ON b.id = co.booking_id WHERE co.id = a.entity_id)
  WHEN 'invoice' THEN (SELECT b.request_id FROM invoices AS i
    JOIN bookings AS b ON b.id = i.booking_id WHERE i.id = a.entity_id)
  WHEN 'review' THEN (SELECT b.request_id FROM reviews AS rv
    JOIN bookings AS b ON b.id = rv.booking_id WHERE rv.id = a.entity_id)
END)`;

const RELATED_MECHANIC_ID = sql<string | null>`(CASE a.entity_type
  WHEN 'mechanic' THEN (SELECT p.user_id FROM mechanic_profiles AS p WHERE p.user_id = a.entity_id)
  WHEN 'user' THEN (SELECT p.user_id FROM mechanic_profiles AS p WHERE p.user_id = a.entity_id)
  WHEN 'mechanic_document' THEN (SELECT d.mechanic_id FROM mechanic_documents AS d WHERE d.id = a.entity_id)
END)`;

// A short name for the record, looked up the same way: the mechanic or account's display
// name, the repair (vehicle and category) behind a marketplace record, a category's name,
// a help request's topic. Null when the record is gone or has no useful name.
const RELATED_NAME = sql<string | null>`(CASE a.entity_type
  WHEN 'mechanic' THEN (SELECT p.display_name FROM mechanic_profiles AS p WHERE p.user_id = a.entity_id)
  WHEN 'user' THEN (SELECT u.display_name FROM users AS u WHERE u.id = a.entity_id)
  WHEN 'mechanic_document' THEN (SELECT p.display_name FROM mechanic_documents AS d
    JOIN mechanic_profiles AS p ON p.user_id = d.mechanic_id WHERE d.id = a.entity_id)
  WHEN 'category' THEN (SELECT c.name FROM service_categories AS c WHERE c.id = a.entity_id)
  WHEN 'support_request' THEN (SELECT s.topic FROM support_requests AS s WHERE s.id = a.entity_id)
  ELSE (SELECT r.vehicle_year || ' ' || r.vehicle_make || ' ' || r.vehicle_model || ' · ' || c.name
    FROM repair_requests AS r JOIN service_categories AS c ON c.id = r.category_id
    WHERE r.id = ${RELATED_REQUEST_ID})
END)`;

const DOCUMENT_KIND = sql<string | null>`(CASE WHEN a.entity_type = 'mechanic_document'
  THEN (SELECT d.kind FROM mechanic_documents AS d WHERE d.id = a.entity_id) END)`;

/** Audit events with their actor's display name and related records; add where/order/limit. */
export function auditEventsQuery(db: Kysely<DB>) {
  return db
    .selectFrom("audit_events as a")
    .leftJoin("users as actor", "actor.id", "a.actor_user_id")
    .select([
      "a.id",
      "a.created_at",
      "a.action",
      "a.entity_type",
      "a.entity_id",
      "a.reason",
      "a.metadata_json",
      "a.actor_role",
      "a.actor_user_id",
      "actor.display_name as actor_name",
      RELATED_REQUEST_ID.as("related_request_id"),
      RELATED_MECHANIC_ID.as("related_mechanic_id"),
      RELATED_NAME.as("related_name"),
      DOCUMENT_KIND.as("document_kind"),
    ]);
}

type AuditEventRow = Awaited<ReturnType<ReturnType<typeof auditEventsQuery>["execute"]>>[number];

/** Tie-breaker after `a.created_at desc`: events written in one transaction share a timestamp. */
export const AUDIT_ROWID = sql`a.rowid`;

export function toAuditEventItem(row: AuditEventRow): AuditEventItem {
  const metadata = parseJsonObject(row.metadata_json);
  const role = oneOf(ACTOR_ROLES, row.actor_role, "audit_events.actor_role");
  return {
    id: row.id,
    createdAt: row.created_at,
    action: row.action,
    actionCode: auditActionCode(row.action),
    actionLabel: auditActionLabel(row.action),
    entityType: row.entity_type,
    entityLabel: auditEntityLabel(row.entity_type),
    entityName: auditEntityName({
      entityType: row.entity_type,
      entityId: row.entity_id,
      relatedName: row.related_name,
      documentKind: row.document_kind,
      metadata,
    }),
    entityId: row.entity_id,
    entityHref: auditEntityHref(
      row.entity_type,
      { requestId: row.related_request_id, mechanicId: row.related_mechanic_id },
      metadata,
    ),
    reason: row.reason,
    actor: {
      id: row.actor_user_id,
      displayName: role === "system" ? "System" : (row.actor_name ?? "Unknown user"),
      role,
    },
    metadata,
  };
}
