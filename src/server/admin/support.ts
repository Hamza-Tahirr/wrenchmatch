import "server-only";

import { sql } from "kysely";

import { BOOKING_STATUSES, type BookingStatus } from "@/lib/domain";
import { supportListQuerySchema, supportResolutionSchema } from "@/lib/validation/admin";
import {
  SUPPORT_STATUSES,
  SUPPORT_TOPIC_INFO,
  SUPPORT_TOPICS,
  type SupportStatus,
  type SupportTopic,
} from "@/lib/validation/support";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { notify } from "@/server/notifications/notify";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { emailText, sentence } from "./messages";
import { pageWindow, toPaged } from "./paging";
import { vehicleLabel } from "./request-items";
import { oneOf, type Paged, type PersonRef } from "./types";

// The help desk: help and dispute requests raised by customers and mechanics (migration
// 0002), optionally about one of their requests or bookings. Admins resolve them with a
// note the requester sees.

export type AdminSupportRequestItem = {
  id: string;
  topic: SupportTopic;
  topicLabel: string;
  message: string;
  /** The message asks to delete or close an account ("please delete my account"), whatever the topic. */
  mentionsAccountDeletion: boolean;
  status: SupportStatus;
  requester: PersonRef & { role: "customer" | "mechanic" };
  /** The request it is about (directly, or through the booking), with a short summary. */
  linkedRequest: { id: string; summary: string } | null;
  linkedBooking: { id: string; status: BookingStatus; isDemoFixture: boolean } | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: PersonRef | null;
  resolutionNote: string | null;
};

export type ResolveSupportRequestInput = {
  supportRequestId: string;
  /** 3-1000 characters; sent to the requester. */
  resolutionNote: string;
};

export type ResolveSupportRequestResult = { supportRequestId: string; status: "resolved"; resolvedAt: string };

/** How many help requests there are, by status and per topic (for the help desk filters). */
export type SupportCounts = {
  open: number;
  resolved: number;
  topics: Record<SupportTopic, Record<SupportStatus, number>>;
};

/**
 * Account-deletion wording: a verb such as delete, close or erase followed within a few words by
 * account, profile or personal data ("please delete my account", "close my WrenchMatch
 * account", "erase my personal data"), or the reverse ("I want my account deleted").
 */
const ACCOUNT_DELETION_PATTERN =
  /\b(?:delete|deleting|deletion|erase|erasing|close|closing|remove|removing|cancel|cancelling|canceling)\s+(?:\w+\s+){0,2}(?:account|profile|personal data|my data)\b|\b(?:account|profile)\s+(?:\w+\s+){0,2}(?:deleted|deletion|erased|removed|closed)\b/i;

export function mentionsAccountDeletion(message: string): boolean {
  return ACCOUNT_DELETION_PATTERN.test(message);
}

/** Help requests, open ones first (oldest first, so nobody waits longest), then resolved. */
export async function listSupportRequests(
  ctx: AppContext,
  viewer: Viewer,
  filters: { status?: SupportStatus; topic?: SupportTopic; page?: number } = {},
): Promise<Paged<AdminSupportRequestItem>> {
  assertAdmin(viewer);
  const { status, topic: topicFilter, page } = parseAdminInput(supportListQuerySchema, filters);
  const base = ctx.db
    .selectFrom("support_requests as s")
    .innerJoin("users as requester", "requester.id", "s.user_id")
    .leftJoin("bookings as b", "b.id", "s.booking_id")
    // the request the help request is about: named directly, or the booking's request
    .leftJoin("repair_requests as r", (join) =>
      join.on((eb) => eb("r.id", "=", eb.fn.coalesce("s.request_id", "b.request_id"))),
    )
    .leftJoin("service_categories as c", "c.id", "r.category_id")
    .leftJoin("users as resolver", "resolver.id", "s.resolved_by");
  const byStatus = status ? base.where("s.status", "=", status) : base;
  const filtered = topicFilter ? byStatus.where("s.topic", "=", topicFilter) : byStatus;

  const { total } = await filtered.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow();
  const window = pageWindow(page, Number(total));
  const rows = await filtered
    .select([
      "s.id",
      "s.topic",
      "s.message",
      "s.status",
      "s.user_id",
      "s.role",
      "requester.display_name as requester_name",
      "s.request_id",
      "s.booking_id",
      "b.status as booking_status",
      "b.is_demo_fixture as booking_is_demo",
      "r.id as linked_request_id",
      "c.name as category_name",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "s.created_at",
      "s.resolved_at",
      "s.resolved_by",
      "resolver.display_name as resolver_name",
      "s.resolution_note",
    ])
    .orderBy((eb) => eb.case().when("s.status", "=", "open").then(0).else(1).end())
    .orderBy("s.created_at")
    .orderBy(sql`s.rowid`)
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();

  return toPaged(
    rows.map((row) => {
      const topic = oneOf(SUPPORT_TOPICS, row.topic, "support_requests.topic");
      const linkedRequest =
        row.linked_request_id !== null && row.category_name !== null && row.vehicle_year !== null
          ? {
              id: row.linked_request_id,
              summary: `${row.category_name} · ${vehicleLabel(row.vehicle_year, row.vehicle_make ?? "", row.vehicle_model ?? "")}`,
            }
          : null;
      return {
        id: row.id,
        topic,
        topicLabel: SUPPORT_TOPIC_INFO[topic].label,
        message: row.message,
        mentionsAccountDeletion: mentionsAccountDeletion(row.message),
        status: oneOf(SUPPORT_STATUSES, row.status, "support_requests.status"),
        requester: {
          id: row.user_id,
          displayName: row.requester_name,
          role: oneOf(["customer", "mechanic"] as const, row.role, "support_requests.role"),
        },
        linkedRequest,
        linkedBooking:
          row.booking_id !== null && row.booking_status !== null
            ? {
                id: row.booking_id,
                status: oneOf(BOOKING_STATUSES, row.booking_status, "bookings.status"),
                isDemoFixture: row.booking_is_demo === 1,
              }
            : null,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by === null ? null : { id: row.resolved_by, displayName: row.resolver_name ?? "Unknown user" },
        resolutionNote: row.resolution_note,
      };
    }),
    window,
    Number(total),
  );
}

/** Help request counts by status and topic, from one grouped query. */
export async function getSupportCounts(ctx: AppContext, viewer: Viewer): Promise<SupportCounts> {
  assertAdmin(viewer);
  const rows = await ctx.db
    .selectFrom("support_requests")
    .select((eb) => ["topic", "status", eb.fn.countAll<number>().as("n")])
    .groupBy(["topic", "status"])
    .execute();
  const topics = Object.fromEntries(SUPPORT_TOPICS.map((topic) => [topic, { open: 0, resolved: 0 }])) as SupportCounts["topics"];
  const counts: SupportCounts = { open: 0, resolved: 0, topics };
  for (const row of rows) {
    const topic = oneOf(SUPPORT_TOPICS, row.topic, "support_requests.topic");
    const status = oneOf(SUPPORT_STATUSES, row.status, "support_requests.status");
    const n = Number(row.n);
    topics[topic][status] += n;
    counts[status] += n;
  }
  return counts;
}

/**
 * Resolves an open help request with a note, notifies the requester (in-app and dev
 * mailbox) and writes an audit event.
 *
 * Throws DomainError: forbidden, invalid_input, not_found, conflict (already resolved).
 */
export async function resolveSupportRequest(
  ctx: AppContext,
  viewer: Viewer,
  input: ResolveSupportRequestInput,
): Promise<ResolveSupportRequestResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(supportResolutionSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const request = await trx
      .selectFrom("support_requests as s")
      .innerJoin("users as u", "u.id", "s.user_id")
      .select(["s.id", "s.user_id", "s.topic", "s.status", "s.request_id", "s.booking_id", "u.display_name"])
      .where("s.id", "=", data.supportRequestId)
      .executeTakeFirst();
    if (!request) throw new DomainError("not_found", "That help request was not found.");
    if (request.status !== "open") {
      throw new DomainError("conflict", "This help request was already resolved. Refresh to see the latest.");
    }

    await trx
      .updateTable("support_requests")
      .set({ status: "resolved", resolution_note: data.resolutionNote, resolved_by: viewer.id, resolved_at: nowIso })
      .where("id", "=", request.id)
      .where("status", "=", "open")
      .execute();

    const topic = oneOf(SUPPORT_TOPICS, request.topic, "support_requests.topic");
    const title = "Your help request was resolved";
    const body = `${SUPPORT_TOPIC_INFO[topic].label}: ${sentence(data.resolutionNote)}`;
    await notify(trx, {
      userId: request.user_id,
      type: "support.resolved",
      title,
      body,
      linkPath: "/support",
      email: { subject: title, text: emailText(request.display_name, [body], "/support"), template: "support_resolved" },
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.supportRequestResolved,
      entityType: "support_request",
      entityId: request.id,
      reason: data.resolutionNote.length <= 500 ? data.resolutionNote : `${data.resolutionNote.slice(0, 499)}…`,
      metadata: {
        topic,
        requesterId: request.user_id,
        ...(request.request_id ? { requestId: request.request_id } : {}),
        ...(request.booking_id ? { bookingId: request.booking_id } : {}),
      },
      at: ctx.now,
    });

    return { supportRequestId: request.id, status: "resolved", resolvedAt: nowIso };
  });
}
