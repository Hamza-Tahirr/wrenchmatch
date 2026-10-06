import "server-only";

import type { AppContext, Viewer } from "@/server/context";

import { assertCustomer, notFound } from "./access";

// Cheap existence-and-ownership checks for the customer's record pages. Route layouts run
// them before the page streams, so a missing or someone else's record gets a real 404
// (and signed-out visitors a real redirect) rather than a soft 404 inside a loading state.
// They reveal nothing: another customer's record and a missing one look the same.

/** Throws not_found unless `requestId` is one of the viewer's repair requests. */
export async function assertOwnRequest(ctx: Pick<AppContext, "db">, viewer: Viewer, requestId: string): Promise<void> {
  assertCustomer(viewer);
  const row = await ctx.db
    .selectFrom("repair_requests")
    .select("id")
    .where("id", "=", requestId)
    .where("customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("request");
}

/** Throws not_found unless `quoteId` is a quote on the viewer's request `requestId`. */
export async function assertOwnQuote(
  ctx: Pick<AppContext, "db">,
  viewer: Viewer,
  ids: { requestId: string; quoteId: string },
): Promise<void> {
  assertCustomer(viewer);
  const row = await ctx.db
    .selectFrom("quotes as q")
    .innerJoin("repair_requests as r", "r.id", "q.request_id")
    .select("q.id")
    .where("q.id", "=", ids.quoteId)
    .where("q.request_id", "=", ids.requestId)
    .where("r.customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("quote");
}

/** Throws not_found unless `bookingId` is one of the viewer's reservations or bookings. */
export async function assertOwnBooking(ctx: Pick<AppContext, "db">, viewer: Viewer, bookingId: string): Promise<void> {
  assertCustomer(viewer);
  const row = await ctx.db
    .selectFrom("bookings")
    .select("id")
    .where("id", "=", bookingId)
    .where("customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!row) throw notFound("booking");
}
