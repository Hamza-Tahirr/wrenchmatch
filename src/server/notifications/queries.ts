import "server-only";

import { sql } from "kysely";

import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";

// In-app notifications for the signed-in user (any role). Every query is scoped to
// viewer.id; another user's notification id behaves exactly like a missing one.

export const NOTIFICATIONS_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type NotificationItem = {
  id: string;
  /** Event type, e.g. "quote.received". */
  type: string;
  title: string;
  body: string;
  /** App-relative link, e.g. "/requests/<id>", or null. */
  linkPath: string | null;
  /** UTC ISO timestamps. */
  createdAt: string;
  readAt: string | null;
};

export type NotificationPage = {
  items: NotificationItem[];
  /** The page actually returned (requests past the end get the last page). */
  page: number;
  pageSize: number;
  totalCount: number;
  /** At least 1, so "page 1 of 1" also describes an empty list. */
  totalPages: number;
  unreadCount: number;
};

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** The viewer's notifications, newest first, one page at a time. */
export async function listForViewer(
  ctx: AppContext,
  viewer: Viewer,
  options: { page?: number; pageSize?: number } = {},
): Promise<NotificationPage> {
  const pageSize = clampInteger(options.pageSize, 1, MAX_PAGE_SIZE, NOTIFICATIONS_PAGE_SIZE);
  const totals = await ctx.db
    .selectFrom("notifications")
    .select([sql<number>`count(*)`.as("total"), sql<number>`count(*) - count(read_at)`.as("unread")])
    .where("user_id", "=", viewer.id)
    .executeTakeFirstOrThrow();
  const totalCount = Number(totals.total);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = clampInteger(options.page, 1, totalPages, 1);

  const rows = await ctx.db
    .selectFrom("notifications")
    .select(["id", "type", "title", "body", "link_path", "read_at", "created_at"])
    .where("user_id", "=", viewer.id)
    .orderBy("created_at", "desc")
    // Rows written in one transaction share created_at; insertion order breaks the tie.
    .orderBy(sql`rowid`, "desc")
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute();

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      linkPath: row.link_path,
      createdAt: row.created_at,
      readAt: row.read_at,
    })),
    page,
    pageSize,
    totalCount,
    totalPages,
    unreadCount: Number(totals.unread),
  };
}

/** How many of the viewer's notifications are unread (the header badge). */
export async function unreadCount(ctx: AppContext, viewer: Viewer): Promise<number> {
  const row = await ctx.db
    .selectFrom("notifications")
    .select(sql<number>`count(*)`.as("unread"))
    .where("user_id", "=", viewer.id)
    .where("read_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.unread);
}

/**
 * Marks one of the viewer's notifications as read (keeping the first read time) and
 * returns its link. Throws DomainError("not_found") for a missing id or one that belongs
 * to someone else.
 */
export async function markRead(
  ctx: AppContext,
  viewer: Viewer,
  notificationId: string,
): Promise<{ linkPath: string | null }> {
  const row = await ctx.db
    .updateTable("notifications")
    .set({ read_at: sql<string>`coalesce(read_at, ${ctx.now.toISOString()})` })
    .where("id", "=", notificationId)
    .where("user_id", "=", viewer.id)
    .returning(["link_path"])
    .executeTakeFirst();
  if (!row) throw new DomainError("not_found", "That notification wasn't found. It may have been removed.");
  return { linkPath: row.link_path };
}

/** Marks all of the viewer's unread notifications as read. Returns how many changed. */
export async function markAllRead(ctx: AppContext, viewer: Viewer): Promise<number> {
  return writeTx(ctx.db, async (trx) => {
    const result = await trx
      .updateTable("notifications")
      .set({ read_at: ctx.now.toISOString() })
      .where("user_id", "=", viewer.id)
      .where("read_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  });
}
