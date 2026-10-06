import "server-only";

import { QUOTE_STATUSES, REQUEST_SERVICE_MODES, REQUEST_STATUSES, type QuoteStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { todayInZone, utcToZonedParts } from "@/lib/time";
import { quoteCommandSchema, type QuoteCommand } from "@/lib/validation/quote";
import { recordAudit } from "@/server/audit";
import { assertWithinRateLimit } from "@/server/auth/rate-limit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError, mapDbError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { newId } from "@/server/ids";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { notify } from "@/server/notifications/notify";
import { computeQuoteTotals, type PricedItem, type QuoteTotals } from "@/server/pricing";

import { assertMechanic, loadMechanicState, oneOf } from "./access";
import { insuranceCovers, jobEligibility } from "./eligibility";
import { isRequestOpenForQuotes, vehicleLabel } from "./labels";
import { quoteReceivedMessage, quoteWithdrawnMessage } from "./messages";
import { formatSlotTime, quoteExpiresAt, resolveSlot } from "./quote-rules";
import { allowedQuoteModes } from "./service-modes";
import { invalidField, parseCommand } from "./shared";

// Quotes from the mechanic side (ARCHITECTURE sections 5 and 7). A quote's terms and items
// are immutable once written; money is computed only by pricing.ts from the saved items. A
// submitted quote commits its slot until it expires: the quotes_no_overlapping_slot trigger
// backs the application check below.

export type SubmitQuoteInput = QuoteCommand & { requestId: string };

export type SubmitQuoteResult = {
  quoteId: string;
  requestId: string;
  totals: QuoteTotals;
  slotStartAt: string;
  slotEndAt: string;
  expiresAt: string;
};

export const SLOT_CONFLICT_MESSAGE = "You already offered an overlapping time in another active quote or booking";

const notFound = () => new DomainError("not_found", "That job wasn't found.");

function slotConflictError(): DomainError {
  const message = `${SLOT_CONFLICT_MESSAGE}. Choose a different time.`;
  return new DomainError("slot_conflict", message, { fieldErrors: { earliestStart: [message] } });
}

type QuoteLine = PricedItem & { description: string };

/** Labor first, then parts, taxes and fees: the order the customer reads them. */
export function quoteLines(quote: QuoteCommand): QuoteLine[] {
  return [
    { kind: "labor", description: "Labor", quantity: 1, unitPriceCents: quote.laborCents },
    ...quote.parts.map((part): QuoteLine => ({
      kind: "part",
      description: part.description,
      quantity: part.quantity,
      unitPriceCents: part.unitPriceCents,
    })),
    ...quote.taxes.map((tax): QuoteLine => ({ kind: "tax", description: tax.description, quantity: 1, unitPriceCents: tax.amountCents })),
    ...quote.fees.map((fee): QuoteLine => ({ kind: "fee", description: fee.description, quantity: 1, unitPriceCents: fee.amountCents })),
  ];
}

async function hasOverlappingCommitment(trx: Tx, mechanicId: string, startIso: string, endIso: string): Promise<boolean> {
  const quote = await trx
    .selectFrom("quotes")
    .select("id")
    .where("mechanic_id", "=", mechanicId)
    .where("status", "in", ["submitted", "selected"])
    .where("slot_start_at", "<", endIso)
    .where("slot_end_at", ">", startIso)
    .executeTakeFirst();
  if (quote) return true;
  const booking = await trx
    .selectFrom("bookings")
    .select("id")
    .where("mechanic_id", "=", mechanicId)
    .where("status", "in", ["pending_payment", "confirmed", "in_progress"])
    .where("slot_start_at", "<", endIso)
    .where("slot_end_at", ">", startIso)
    .executeTakeFirst();
  return booking !== undefined;
}

async function loadRequestForQuote(trx: Tx, requestId: string) {
  return trx
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "r.id",
      "r.customer_id",
      "r.status",
      "r.expires_at",
      "r.time_zone",
      "r.preferred_date",
      "r.service_mode",
      "r.max_garage_distance_miles",
      "r.approx_lat",
      "r.approx_lng",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.category_id",
      "c.name as category_name",
      "c.safety_sensitive",
    ])
    .where("r.id", "=", requestId)
    .executeTakeFirst();
}

/**
 * Sends a quote on a matched job, in one BEGIN IMMEDIATE transaction: rate limit (30 an hour),
 * expire stale records, check the match, the mechanic (approved, accepting jobs, insured
 * through today, the preferred date and the offered day; safety approval for brake and
 * suspension work), the request (open or quoted, unexpired), the service mode and the slot
 * (local time in the request's zone, at least 1 hour and at most 30 days ahead, no overlap
 * with the mechanic's active quotes and bookings). Totals come from pricing.ts. Inserts the
 * quote and its items, marks the match quoted and the request quoted, notifies the customer
 * (no mechanic contact details) and records an audit event.
 *
 * Throws DomainError: not_found (no match), mechanic_not_eligible, conflict (request closed,
 * active quote exists, passed), invalid_input / slot_conflict with details.fieldErrors keyed
 * by quote form field (earliestStart, serviceMode), rate_limited.
 */
export async function submitQuote(ctx: AppContext, viewer: Viewer, input: SubmitQuoteInput): Promise<SubmitQuoteResult> {
  assertMechanic(viewer);
  const { requestId, ...terms } = input;
  const quote = parseCommand(quoteCommandSchema, terms, "Some quote details are missing or invalid. Check the form and try again.");
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    await assertWithinRateLimit({ ...ctx, db: trx }, "quote_submit", viewer.id);
    await expireStaleRecords(trx, ctx.now);

    const match = await trx
      .selectFrom("job_matches")
      .select(["id", "status"])
      .where("request_id", "=", requestId)
      .where("mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!match) throw notFound();
    const state = await loadMechanicState(trx, viewer.id);
    if (!state) throw notFound();
    if (state.status !== "approved") {
      const eligibility = jobEligibility(state, todayInZone(ctx.now, state.timeZone));
      throw new DomainError("mechanic_not_eligible", eligibility.message, { reason: eligibility.reason ?? null });
    }
    if (!state.acceptingJobs) {
      throw new DomainError(
        "mechanic_not_eligible",
        "You've paused new jobs. Turn on Accepting jobs on your profile to send quotes.",
        { reason: "not_accepting" },
      );
    }

    const request = await loadRequestForQuote(trx, requestId);
    if (!request) throw notFound();
    const requestStatus = oneOf(REQUEST_STATUSES, request.status, "repair_requests.status");
    if (!isRequestOpenForQuotes(requestStatus, request.expires_at, nowIso)) {
      throw new DomainError(
        "conflict",
        "This job is no longer accepting quotes: it may have expired, been cancelled or been booked.",
      );
    }
    if (match.status === "passed") {
      throw new DomainError("conflict", "You passed on this job. Mark yourself interested before sending a quote.");
    }
    const active = await trx
      .selectFrom("quotes")
      .select("id")
      .where("request_id", "=", requestId)
      .where("mechanic_id", "=", viewer.id)
      .where("status", "in", ["submitted", "selected"])
      .executeTakeFirst();
    if (active) {
      throw new DomainError(
        "conflict",
        "You already have an active quote on this job. Withdraw it before sending a new one.",
      );
    }
    if (request.safety_sensitive === 1) {
      const service = await trx
        .selectFrom("mechanic_services")
        .select("safety_approved")
        .where("mechanic_id", "=", viewer.id)
        .where("category_id", "=", request.category_id)
        .executeTakeFirst();
      if (service?.safety_approved !== 1) {
        throw new DomainError(
          "mechanic_not_eligible",
          `${request.category_name} is safety-critical work. An admin must approve you for it before you can quote.`,
          { reason: "safety_category_not_approved" },
        );
      }
    }

    const distanceMiles = roundMiles(
      haversineMiles({ lat: request.approx_lat, lng: request.approx_lng }, state.basePoint),
    );
    const allowedModes = allowedQuoteModes({
      requestMode: oneOf(REQUEST_SERVICE_MODES, request.service_mode, "repair_requests.service_mode"),
      maxGarageDistanceMiles: request.max_garage_distance_miles,
      mechanicMode: state.serviceMode,
      travelRadiusMiles: state.travelRadiusMiles,
      distanceMiles,
    });
    if (!allowedModes.includes(quote.serviceMode)) {
      throw invalidField(
        "serviceMode",
        allowedModes.length === 0
          ? "Your current service modes and travel radius don't cover this job. Update your profile to quote it."
          : `For this job you can quote ${allowedModes.map((mode) => (mode === "mobile" ? "mobile service" : "garage service")).join(" or ")} only.`,
      );
    }

    const slot = resolveSlot(quote.earliestStartLocal, quote.durationMinutes, request.time_zone, ctx.now);
    if (!slot.ok) throw invalidField("earliestStart", slot.message);
    const todayLocal = todayInZone(ctx.now, request.time_zone);
    const slotDate = utcToZonedParts(slot.start, request.time_zone).date;
    if (!insuranceCovers(state, todayLocal, request.preferred_date, slotDate)) {
      throw new DomainError(
        "mechanic_not_eligible",
        state.insuranceExpiresOn
          ? `Your insurance expires on ${formatDate(state.insuranceExpiresOn)}, before the customer's preferred date or the time you offered. Update your insurance on your profile, or offer an earlier time.`
          : "Add your insurance details on your profile before sending quotes.",
        { reason: "insurance_expired" },
      );
    }
    const slotStartIso = slot.start.toISOString();
    const slotEndIso = slot.end.toISOString();
    if (await hasOverlappingCommitment(trx, viewer.id, slotStartIso, slotEndIso)) throw slotConflictError();

    const lines = quoteLines(quote);
    const totals = computeQuoteTotals(lines);
    const expiresAt = quoteExpiresAt(ctx.now, quote.validityHours, slot.start, request.expires_at).toISOString();
    const quoteId = newId();

    try {
      await trx
        .insertInto("quotes")
        .values({
          id: quoteId,
          request_id: requestId,
          mechanic_id: viewer.id,
          status: "submitted",
          service_mode: quote.serviceMode,
          parts_included: quote.partsIncluded ? 1 : 0,
          currency: "USD",
          labor_cents: totals.laborCents,
          parts_cents: totals.partsCents,
          tax_cents: totals.taxCents,
          fee_cents: totals.feeCents,
          total_cents: totals.totalCents,
          slot_start_at: slotStartIso,
          slot_end_at: slotEndIso,
          estimated_duration_minutes: quote.durationMinutes,
          scope: quote.scope,
          exclusions: quote.exclusions,
          notes: quote.notes,
          expires_at: expiresAt,
          is_demo_fixture: 0,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .execute();
    } catch (error) {
      const mapped = mapDbError(error);
      throw mapped.code === "slot_conflict" ? slotConflictError() : mapped;
    }
    await trx
      .insertInto("quote_items")
      .values(
        lines.map((line, index) => ({
          id: newId(),
          quote_id: quoteId,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unit_price_cents: line.unitPriceCents,
          amount_cents: line.quantity * line.unitPriceCents,
          sort_order: index,
        })),
      )
      .execute();

    await trx
      .updateTable("job_matches")
      .set({ status: "quoted", updated_at: nowIso })
      .where("id", "=", match.id)
      .execute();
    await trx
      .updateTable("repair_requests")
      .set({ status: "quoted", updated_at: nowIso })
      .where("id", "=", requestId)
      .where("status", "=", "open")
      .execute();

    await notify(trx, {
      userId: request.customer_id,
      ...quoteReceivedMessage({
        requestId,
        mechanicName: state.displayName,
        vehicle: vehicleLabel(request.vehicle_year, request.vehicle_make, request.vehicle_model),
        categoryName: request.category_name,
        totalCents: totals.totalCents,
        slotText: formatSlotTime(slot.start, request.time_zone),
        expiresText: formatSlotTime(new Date(expiresAt), request.time_zone),
      }),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "quote.submit",
      entityType: "quote",
      entityId: quoteId,
      metadata: {
        requestId,
        totalCents: totals.totalCents,
        laborCents: totals.laborCents,
        serviceMode: quote.serviceMode,
        slotStartAt: slotStartIso,
        slotEndAt: slotEndIso,
        expiresAt,
        validityHours: quote.validityHours,
        itemCount: lines.length,
      },
      at: ctx.now,
    });

    return { quoteId, requestId, totals, slotStartAt: slotStartIso, slotEndAt: slotEndIso, expiresAt };
  });
}

export type WithdrawQuoteResult = {
  quoteId: string;
  requestId: string;
  /** The request's status afterwards ("open" when no other quote is active). */
  requestStatus: "open" | "quoted";
};

const NOT_WITHDRAWABLE: Readonly<Record<Exclude<QuoteStatus, "submitted">, string>> = {
  withdrawn: "You already withdrew this quote.",
  expired: "This quote has already expired, so there's nothing to withdraw.",
  selected:
    "The customer already selected this quote, so it can't be withdrawn. Contact support if you can't do the job.",
  declined: "The customer chose another quote, so this one is no longer active.",
};

/**
 * Withdraws the mechanic's own submitted quote (submitted -> withdrawn). The request goes back
 * to open when no other quote is active, the job match back to interested (so the mechanic
 * may quote again), the customer is notified and an audit event is recorded. Another
 * mechanic's quote (or a missing id) throws DomainError("not_found"); a quote that is no
 * longer submitted throws "conflict".
 */
export async function withdrawQuote(ctx: AppContext, viewer: Viewer, quoteId: string): Promise<WithdrawQuoteResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const quote = await trx
      .selectFrom("quotes as q")
      .innerJoin("repair_requests as r", "r.id", "q.request_id")
      .innerJoin("service_categories as c", "c.id", "r.category_id")
      .innerJoin("mechanic_profiles as p", "p.user_id", "q.mechanic_id")
      .select([
        "q.id",
        "q.status",
        "q.request_id",
        "q.total_cents",
        "r.customer_id",
        "r.status as request_status",
        "r.vehicle_year",
        "r.vehicle_make",
        "r.vehicle_model",
        "c.name as category_name",
        "p.display_name",
      ])
      .where("q.id", "=", quoteId)
      .where("q.mechanic_id", "=", viewer.id)
      .executeTakeFirst();
    if (!quote) throw new DomainError("not_found", "That quote wasn't found.");
    const status = oneOf(QUOTE_STATUSES, quote.status, "quotes.status");
    if (status !== "submitted") throw new DomainError("conflict", NOT_WITHDRAWABLE[status]);

    await trx
      .updateTable("quotes")
      .set({ status: "withdrawn", withdrawn_at: nowIso, updated_at: nowIso })
      .where("id", "=", quoteId)
      .where("status", "=", "submitted")
      .execute();

    const remaining = await trx
      .selectFrom("quotes")
      .select(["status"])
      .where("request_id", "=", quote.request_id)
      .where("status", "in", ["submitted", "selected"])
      .execute();
    let requestStatus: "open" | "quoted" = quote.request_status === "open" ? "open" : "quoted";
    if (remaining.length === 0 && quote.request_status === "quoted") {
      await trx
        .updateTable("repair_requests")
        .set({ status: "open", updated_at: nowIso })
        .where("id", "=", quote.request_id)
        .where("status", "=", "quoted")
        .execute();
      requestStatus = "open";
    }
    await trx
      .updateTable("job_matches")
      .set({ status: "interested", updated_at: nowIso })
      .where("request_id", "=", quote.request_id)
      .where("mechanic_id", "=", viewer.id)
      .where("status", "=", "quoted")
      .execute();

    await notify(trx, {
      userId: quote.customer_id,
      ...quoteWithdrawnMessage({
        requestId: quote.request_id,
        mechanicName: quote.display_name,
        vehicle: vehicleLabel(quote.vehicle_year, quote.vehicle_make, quote.vehicle_model),
        categoryName: quote.category_name,
        totalCents: quote.total_cents,
        remainingQuotes: remaining.filter((row) => row.status === "submitted").length,
      }),
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: "quote.withdraw",
      entityType: "quote",
      entityId: quoteId,
      metadata: { requestId: quote.request_id, requestStatus },
      at: ctx.now,
    });
    return { quoteId, requestId: quote.request_id, requestStatus };
  });
}
