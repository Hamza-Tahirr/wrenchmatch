// Sample quotes are seeded fixtures (quotes.is_demo_fixture = 1, a column no update may change), so
// they can't come from submitQuote, which always writes real quotes. They are inserted here
// following submitQuote's rules: the quote form's command schema and line items
// (quoteLines), the slot and expiry rules (quote-rules.ts), totals from pricing.ts, an
// approved and insured mechanic matched to the request with an allowed service mode, the
// job match marked quoted, the request moved to quoted, the customer notified, an audit event.
import { REQUEST_SERVICE_MODES, REQUEST_STATUSES } from "@/lib/domain";
import { todayInZone, utcToZonedParts } from "@/lib/time";
import { quoteCommandSchema, type QuoteCommand } from "@/lib/validation/quote";
import { recordAudit } from "@/server/audit";
import type { Viewer } from "@/server/context";
import { oneOf } from "@/server/customer/rows";
import { writeTx, type Tx } from "@/server/db/tx";
import { newId } from "@/server/ids";
import { haversineMiles, roundMiles } from "@/server/matching/geo";
import { loadMechanicState } from "@/server/mechanic/access";
import { insuranceCovers } from "@/server/mechanic/eligibility";
import { vehicleLabel } from "@/server/mechanic/labels";
import { quoteReceivedMessage } from "@/server/mechanic/messages";
import { formatSlotTime, quoteExpiresAt, resolveSlot } from "@/server/mechanic/quote-rules";
import { quoteLines } from "@/server/mechanic/quotes";
import { allowedQuoteModes } from "@/server/mechanic/service-modes";
import { parseCommand } from "@/server/mechanic/shared";
import { notify } from "@/server/notifications/notify";
import { computeQuoteTotals, lineAmountCents, type QuoteTotals } from "@/server/pricing";

import type { SeedRun } from "./types";

export type QuoteRowsInput = {
  requestId: string;
  mechanicId: string;
  command: QuoteCommand;
  quotedAt: Date;
  /** The request's time zone: command.earliestStartLocal is a wall-clock time there. */
  timeZone: string;
  requestExpiresAt: string | null;
  status: "submitted" | "selected";
  /** When the row last changed (the selection time of a selected quote). Default quotedAt. */
  updatedAt?: Date;
};

export type InsertedQuote = {
  quoteId: string;
  command: QuoteCommand;
  totals: QuoteTotals;
  slotStart: Date;
  slotEnd: Date;
  expiresAt: Date;
};

/** Inserts a fixture quote and its line items. The slot-overlap trigger checks submitted ones. */
export async function insertQuoteRows(trx: Tx, input: QuoteRowsInput): Promise<InsertedQuote> {
  const command = parseCommand(quoteCommandSchema, input.command, `Sample quote on request ${input.requestId} is invalid.`);
  const slot = resolveSlot(command.earliestStartLocal, command.durationMinutes, input.timeZone, input.quotedAt);
  if (!slot.ok) throw new Error(`Sample quote on request ${input.requestId}: ${slot.message}`);
  const lines = quoteLines(command);
  const totals = computeQuoteTotals(lines);
  const expiresAt = quoteExpiresAt(input.quotedAt, command.validityHours, slot.start, input.requestExpiresAt);
  const quoteId = newId();

  await trx
    .insertInto("quotes")
    .values({
      id: quoteId,
      request_id: input.requestId,
      mechanic_id: input.mechanicId,
      status: input.status,
      service_mode: command.serviceMode,
      parts_included: command.partsIncluded ? 1 : 0,
      currency: "USD",
      labor_cents: totals.laborCents,
      parts_cents: totals.partsCents,
      tax_cents: totals.taxCents,
      fee_cents: totals.feeCents,
      total_cents: totals.totalCents,
      slot_start_at: slot.start.toISOString(),
      slot_end_at: slot.end.toISOString(),
      estimated_duration_minutes: command.durationMinutes,
      scope: command.scope,
      exclusions: command.exclusions,
      notes: command.notes,
      expires_at: expiresAt.toISOString(),
      is_demo_fixture: 1,
      created_at: input.quotedAt.toISOString(),
      updated_at: (input.updatedAt ?? input.quotedAt).toISOString(),
    })
    .execute();
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
        amount_cents: lineAmountCents(line),
        sort_order: index,
      })),
    )
    .execute();
  return { quoteId, command, totals, slotStart: slot.start, slotEnd: slot.end, expiresAt };
}

async function loadRequest(trx: Tx, requestId: string) {
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
    .executeTakeFirstOrThrow();
}

/** `mechanic` quotes on a matched, open request at `at` (a submitted sample quote). */
export async function submitSampleQuote(
  run: SeedRun,
  input: { requestId: string; mechanic: Viewer; at: Date; quote: QuoteCommand },
): Promise<InsertedQuote> {
  const { mechanic, at } = input;
  run.assertPast(at, `${mechanic.displayName}'s quote`);
  const atIso = at.toISOString();
  return writeTx(run.db, async (trx) => {
    const request = await loadRequest(trx, input.requestId);
    const fail = (problem: string) => new Error(`${mechanic.displayName} can't quote request ${request.id}: ${problem}`);
    const status = oneOf(REQUEST_STATUSES, request.status, "repair_requests.status");
    if (status !== "open" && status !== "quoted") throw fail(`the request is ${status}`);
    const match = await trx
      .selectFrom("job_matches")
      .select(["id"])
      .where("request_id", "=", request.id)
      .where("mechanic_id", "=", mechanic.id)
      .executeTakeFirst();
    if (!match) throw fail("not matched to it");
    const state = await loadMechanicState(trx, mechanic.id);
    if (!state || state.status !== "approved" || !state.acceptingJobs) throw fail("not approved or not accepting jobs");

    const modes = allowedQuoteModes({
      requestMode: oneOf(REQUEST_SERVICE_MODES, request.service_mode, "repair_requests.service_mode"),
      maxGarageDistanceMiles: request.max_garage_distance_miles,
      mechanicMode: state.serviceMode,
      travelRadiusMiles: state.travelRadiusMiles,
      distanceMiles: roundMiles(haversineMiles({ lat: request.approx_lat, lng: request.approx_lng }, state.basePoint)),
    });
    if (!modes.includes(input.quote.serviceMode)) throw fail(`${input.quote.serviceMode} service is not allowed here`);
    if (request.safety_sensitive === 1) {
      const service = await trx
        .selectFrom("mechanic_services")
        .select("safety_approved")
        .where("mechanic_id", "=", mechanic.id)
        .where("category_id", "=", request.category_id)
        .executeTakeFirst();
      if (service?.safety_approved !== 1) throw fail(`not safety-approved for ${request.category_name}`);
    }

    const quote = await insertQuoteRows(trx, {
      requestId: request.id,
      mechanicId: mechanic.id,
      command: input.quote,
      quotedAt: at,
      timeZone: request.time_zone,
      requestExpiresAt: request.expires_at,
      status: "submitted",
    });
    const slotDate = utcToZonedParts(quote.slotStart, request.time_zone).date;
    if (!insuranceCovers(state, todayInZone(at, request.time_zone), request.preferred_date, slotDate)) {
      throw fail("insurance doesn't cover the offered day");
    }

    await trx.updateTable("job_matches").set({ status: "quoted", updated_at: atIso }).where("id", "=", match.id).execute();
    await trx
      .updateTable("repair_requests")
      .set({ status: "quoted", updated_at: atIso })
      .where("id", "=", request.id)
      .where("status", "=", "open")
      .execute();
    await notify(trx, {
      userId: request.customer_id,
      ...quoteReceivedMessage({
        requestId: request.id,
        mechanicName: state.displayName,
        vehicle: vehicleLabel(request.vehicle_year, request.vehicle_make, request.vehicle_model),
        categoryName: request.category_name,
        totalCents: quote.totals.totalCents,
        slotText: formatSlotTime(quote.slotStart, request.time_zone),
        expiresText: formatSlotTime(quote.expiresAt, request.time_zone),
      }),
      at,
    });
    await recordAudit(trx, {
      actor: mechanic,
      action: "quote.submit",
      entityType: "quote",
      entityId: quote.quoteId,
      metadata: {
        requestId: request.id,
        totalCents: quote.totals.totalCents,
        laborCents: quote.totals.laborCents,
        serviceMode: quote.command.serviceMode,
        slotStartAt: quote.slotStart.toISOString(),
        slotEndAt: quote.slotEnd.toISOString(),
        expiresAt: quote.expiresAt.toISOString(),
        validityHours: quote.command.validityHours,
        itemCount: quoteLines(quote.command).length,
        isDemoFixture: true,
      },
      at,
    });
    return quote;
  });
}
