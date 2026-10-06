import "server-only";

import { sql, type Kysely } from "kysely";

import type { BadgeTone } from "@/lib/domain";
import { formatInZone } from "@/lib/time";
import { fieldErrorsFromZod } from "@/lib/validation/request";
import {
  accountDeletionMessage,
  accountDeletionSchema,
  isAccountDeletionMessage,
  SUPPORT_STATUS_INFO,
  SUPPORT_STATUSES,
  SUPPORT_TOPIC_INFO,
  SUPPORT_TOPICS,
  supportRequestSchema,
  type SupportStatus,
  type SupportTopic,
} from "@/lib/validation/support";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";

import { activeAdminIds } from "@/server/customer/admin-recipients";
import { invalidFields } from "@/server/customer/form-errors";
import { oneOf, requestTitle } from "@/server/customer/rows";

// Help and dispute requests raised by customers and mechanics (support_requests). A request
// may point at one of the person's own repair requests or bookings: a customer's own, or for
// a mechanic a booking they work on or a request they were matched to. Admins work them from
// the help desk; notifications to admins carry no personal data.

type SupportRole = "customer" | "mechanic";

export type SupportLinkOption = { id: string; label: string };

export type SupportLinkOptions = {
  /** Requests the viewer may attach (newest first). */
  requests: SupportLinkOption[];
  /** Bookings the viewer may attach (newest first). */
  bookings: SupportLinkOption[];
};

export type SupportLinkedRecord = { id: string; label: string; href: string };

export type SupportRequestSummary = {
  id: string;
  topic: SupportTopic;
  topicLabel: string;
  message: string;
  status: SupportStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  /** The help desk's reply when resolved. */
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** IANA zone to show its times in: the linked request's, else the person's own area's. */
  timeZone: string;
  request: SupportLinkedRecord | null;
  booking: SupportLinkedRecord | null;
};

export type CreateSupportRequestParams = {
  topic: SupportTopic;
  message: string;
  requestId?: string | null;
  bookingId?: string | null;
};

export type CreateSupportRequestResult = { supportRequestId: string };

const LINK_OPTION_LIMIT = 50;

function assertSupportRole(viewer: Viewer): SupportRole {
  if (viewer.role === "customer" || viewer.role === "mechanic") return viewer.role;
  throw new DomainError("forbidden", "Help requests are for customer and mechanic accounts.");
}

function hrefs(role: SupportRole) {
  return role === "customer"
    ? { request: (id: string) => `/requests/${id}`, booking: (id: string) => `/bookings/${id}` }
    : { request: (id: string) => `/mechanic/jobs/${id}`, booking: (id: string) => `/mechanic/bookings/${id}` };
}

function requestLabels(db: Kysely<DB>) {
  return db
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "r.id",
      "r.area_label",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
    ]);
}

function bookingLabels(db: Kysely<DB>) {
  return db
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "b.id",
      "b.request_id",
      "b.slot_start_at",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
    ]);
}

type RequestLabelRow = {
  id: string;
  area_label: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  category_name: string;
};

type BookingLabelRow = {
  id: string;
  slot_start_at: string;
  time_zone: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  category_name: string;
};

function requestLabel(row: RequestLabelRow): string {
  return `${requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model)} (${row.area_label})`;
}

function bookingLabel(row: BookingLabelRow): string {
  const day = formatInZone(new Date(row.slot_start_at), row.time_zone, { dateStyle: "medium" });
  return `${requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model)} · ${day}`;
}

/** Restricts a request query to requests the viewer may attach to a help request. */
function ownRequests(db: Kysely<DB>, role: SupportRole, viewerId: string) {
  const query = requestLabels(db);
  if (role === "customer") return query.where("r.customer_id", "=", viewerId);
  return query.where((eb) =>
    eb.or([
      eb.exists(
        eb
          .selectFrom("job_matches as jm")
          .select("jm.id")
          .whereRef("jm.request_id", "=", "r.id")
          .where("jm.mechanic_id", "=", viewerId),
      ),
      eb.exists(
        eb
          .selectFrom("bookings as ob")
          .select("ob.id")
          .whereRef("ob.request_id", "=", "r.id")
          .where("ob.mechanic_id", "=", viewerId),
      ),
    ]),
  );
}

function ownBookings(db: Kysely<DB>, role: SupportRole, viewerId: string) {
  const query = bookingLabels(db);
  return role === "customer" ? query.where("b.customer_id", "=", viewerId) : query.where("b.mechanic_id", "=", viewerId);
}

/** The requests and bookings the viewer may attach to a help request (for the form's selects). */
export async function listSupportLinkOptions(ctx: AppContext, viewer: Viewer): Promise<SupportLinkOptions> {
  const role = assertSupportRole(viewer);
  const requests = await ownRequests(ctx.db, role, viewer.id)
    .orderBy("r.created_at", "desc")
    .limit(LINK_OPTION_LIMIT)
    .execute();
  const bookings = await ownBookings(ctx.db, role, viewer.id)
    .orderBy("b.created_at", "desc")
    .limit(LINK_OPTION_LIMIT)
    .execute();
  return {
    requests: requests.map((row) => ({ id: row.id, label: requestLabel(row) })),
    bookings: bookings.map((row) => ({ id: row.id, label: bookingLabel(row) })),
  };
}

/**
 * Opens a help request for a customer or mechanic, optionally about one of their own
 * requests or bookings (a booking also links its request). Notifies every admin (no
 * personal data) and the requester, and records an audit event. Throws DomainError:
 * forbidden (admins), invalid_input, not_found (a linked record that isn't the viewer's).
 */
export async function createSupportRequest(
  ctx: AppContext,
  viewer: Viewer,
  input: CreateSupportRequestParams,
): Promise<CreateSupportRequestResult> {
  const role = assertSupportRole(viewer);
  const parsed = supportRequestSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  return writeTx(ctx.db, async (trx) => ({
    supportRequestId: await insertSupportRequest(trx, ctx, viewer, role, parsed.data),
  }));
}

export type AccountDeletionRequestResult = {
  supportRequestId: string;
  /** True when an open deletion request already existed (nothing new was sent). */
  alreadyRequested: boolean;
};

/**
 * "Request account deletion" (MVP_PLAN section 10): sends the help desk a help request with
 * topic "account" through the same path as createSupportRequest. Nothing is deleted or
 * disabled: the team confirms with the person and handles it by hand. While a deletion
 * request is still open, asking again returns that one instead of sending a duplicate.
 * Throws DomainError: forbidden (admins), invalid_input (details too long).
 */
export async function requestAccountDeletion(
  ctx: AppContext,
  viewer: Viewer,
  input: { details?: string | null } = {},
): Promise<AccountDeletionRequestResult> {
  const role = assertSupportRole(viewer);
  const parsed = accountDeletionSchema.safeParse({ details: input.details ?? null });
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const message = accountDeletionMessage(parsed.data.details);

  return writeTx(ctx.db, async (trx) => {
    const openRequests = await trx
      .selectFrom("support_requests")
      .select(["id", "topic", "message"])
      .where("user_id", "=", viewer.id)
      .where("topic", "=", "account")
      .where("status", "=", "open")
      .orderBy("created_at", "desc")
      .execute();
    const open = openRequests.find((row) => isAccountDeletionMessage(row.topic, row.message));
    if (open) return { supportRequestId: open.id, alreadyRequested: true };

    const supportRequestId = await insertSupportRequest(
      trx,
      ctx,
      viewer,
      role,
      { topic: "account", message, requestId: null, bookingId: null },
      {
        adminTitle: "New account deletion request",
        adminBody: `A ${role} asked us to delete their account. Nothing has been deleted: open the help desk to confirm with them and reply.`,
        requesterTitle: "We received your account deletion request",
        requesterBody: "Nothing has been deleted yet. Our team will confirm with you first and reply on the help page.",
        auditMetadata: { accountDeletion: true },
      },
    );
    return { supportRequestId, alreadyRequested: false };
  });
}

type SupportRequestCopy = {
  adminTitle: string;
  adminBody: string;
  requesterTitle: string;
  requesterBody: string;
  auditMetadata: Record<string, unknown>;
};

/**
 * Inserts a validated help request inside `trx` after checking any linked request or
 * booking is the viewer's own; notifies admins and the requester and records an audit event.
 */
async function insertSupportRequest(
  trx: Kysely<DB>,
  ctx: AppContext,
  viewer: Viewer,
  role: SupportRole,
  data: { topic: SupportTopic; message: string; requestId: string | null; bookingId: string | null },
  copy?: Partial<SupportRequestCopy>,
): Promise<string> {
  const { topic, message } = data;
  let requestId = data.requestId;
  const bookingId = data.bookingId;

  if (bookingId) {
    const booking = await ownBookings(trx, role, viewer.id).where("b.id", "=", bookingId).executeTakeFirst();
    if (!booking) {
      throw invalidFields(
        { bookingId: ["We couldn't find that booking in your account."] },
        { code: "not_found" },
      );
    }
    if (requestId && requestId !== booking.request_id) {
      throw invalidFields({ bookingId: ["That booking isn't for the request you chose."] });
    }
    requestId = booking.request_id;
  } else if (requestId) {
    const request = await ownRequests(trx, role, viewer.id).where("r.id", "=", requestId).executeTakeFirst();
    if (!request) {
      throw invalidFields(
        { requestId: ["We couldn't find that request in your account."] },
        { code: "not_found" },
      );
    }
  }

  const id = newId();
  const nowIso = ctx.now.toISOString();
  await trx
    .insertInto("support_requests")
    .values({
      id,
      user_id: viewer.id,
      role,
      request_id: requestId,
      booking_id: bookingId,
      topic,
      message,
      status: "open",
      created_at: nowIso,
    })
    .execute();

  const topicLabel = SUPPORT_TOPIC_INFO[topic].label;
  const about = bookingId ? " about one of their bookings" : requestId ? " about one of their repair requests" : "";
  const adminTitle = copy?.adminTitle ?? `New help request: ${topicLabel}`;
  const adminBody = copy?.adminBody ?? `A ${role} opened a help request${about}. Open the help desk to read it and respond.`;
  for (const adminId of await activeAdminIds(trx)) {
    await notify(trx, {
      userId: adminId,
      type: "support.created",
      title: adminTitle,
      body: adminBody,
      linkPath: "/admin/support",
      email: { subject: adminTitle, text: `${adminBody}\n\nHelp desk: /admin/support`, template: "support_created" },
      at: ctx.now,
    });
  }
  await notify(trx, {
    userId: viewer.id,
    type: "support.received",
    title: copy?.requesterTitle ?? "We received your help request",
    body: copy?.requesterBody ?? `Our team will review your "${topicLabel}" request and reply on the help page.`,
    linkPath: "/support",
    at: ctx.now,
  });
  await recordAudit(trx, {
    actor: viewer,
    action: "support_request.create",
    entityType: "support_request",
    entityId: id,
    metadata: { topic, role, requestId: requestId ?? null, bookingId: bookingId ?? null, ...copy?.auditMetadata },
    at: ctx.now,
  });
  return id;
}

/**
 * The zone a person's own times are shown in when a help request isn't about a request:
 * a customer's latest request's ZIP zone, a mechanic's base ZIP zone, else the first
 * enabled pilot area's, else UTC.
 */
async function homeTimeZone(db: Kysely<DB>, role: SupportRole, viewerId: string): Promise<string> {
  const own =
    role === "customer"
      ? await db
          .selectFrom("repair_requests")
          .select("time_zone")
          .where("customer_id", "=", viewerId)
          .orderBy("created_at", "desc")
          .orderBy(sql`rowid`, "desc")
          .executeTakeFirst()
      : await db
          .selectFrom("mechanic_profiles as m")
          .innerJoin("zip_centroids as z", "z.zip", "m.base_zip")
          .select("z.time_zone")
          .where("m.user_id", "=", viewerId)
          .executeTakeFirst();
  if (own) return own.time_zone;
  const pilot = await db
    .selectFrom("pilot_zips as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.zip")
    .select("z.time_zone")
    .where("p.enabled", "=", 1)
    .orderBy("p.zip")
    .executeTakeFirst();
  return pilot?.time_zone ?? "UTC";
}

/** The viewer's help requests, newest first, with links to the records they are about. */
export async function listMySupportRequests(ctx: AppContext, viewer: Viewer): Promise<SupportRequestSummary[]> {
  const role = assertSupportRole(viewer);
  const rows = await ctx.db
    .selectFrom("support_requests")
    .select(["id", "topic", "message", "status", "resolution_note", "resolved_at", "created_at", "request_id", "booking_id"])
    .where("user_id", "=", viewer.id)
    .orderBy("created_at", "desc")
    .orderBy(sql`rowid`, "desc")
    .execute();

  // Labels only for records the viewer may still see (access can change after linking).
  const requestIds = [...new Set(rows.flatMap((row) => (row.request_id ? [row.request_id] : [])))];
  const bookingIds = [...new Set(rows.flatMap((row) => (row.booking_id ? [row.booking_id] : [])))];
  const requests =
    requestIds.length > 0
      ? await ownRequests(ctx.db, role, viewer.id).where("r.id", "in", requestIds).execute()
      : [];
  const bookings =
    bookingIds.length > 0
      ? await ownBookings(ctx.db, role, viewer.id).where("b.id", "in", bookingIds).execute()
      : [];
  const requestById = new Map(requests.map((row) => [row.id, row]));
  const bookingById = new Map(bookings.map((row) => [row.id, row]));
  const links = hrefs(role);
  const fallbackZone = rows.length > 0 ? await homeTimeZone(ctx.db, role, viewer.id) : "UTC";

  return rows.map((row) => {
    const topic = oneOf(SUPPORT_TOPICS, row.topic, "support_requests.topic");
    const status = oneOf(SUPPORT_STATUSES, row.status, "support_requests.status");
    const request = row.request_id ? requestById.get(row.request_id) : undefined;
    const booking = row.booking_id ? bookingById.get(row.booking_id) : undefined;
    return {
      id: row.id,
      topic,
      topicLabel: SUPPORT_TOPIC_INFO[topic].label,
      message: row.message,
      status,
      statusLabel: SUPPORT_STATUS_INFO[status].label,
      statusTone: SUPPORT_STATUS_INFO[status].tone,
      resolutionNote: row.resolution_note,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      timeZone: request?.time_zone ?? booking?.time_zone ?? fallbackZone,
      request: request ? { id: request.id, label: requestLabel(request), href: links.request(request.id) } : null,
      booking: booking ? { id: booking.id, label: bookingLabel(booking), href: links.booking(booking.id) } : null,
    };
  });
}
