// Post-booking sample records. With online payments not connected nothing in the app can
// confirm a booking (a trigger stops every booking at pending_payment), so these are inserted
// in their final state, as the schema intends: request "booked", quote "selected" and a
// "confirmed" booking, all is_demo_fixture = 1 (internal flag), payment_state
// demo_fixture_no_real_payment (no money moved). Everything else follows the app's rules:
// the request passes the request form's schema, pilot-ZIP and preferred-date checks, the
// booked mechanic passes matching (rules.ts), the quote passes the quote rules, money comes
// from pricing.ts and the snapshots from the builders selectQuote uses. Later steps (start,
// change orders, completion, invoice, review) use the real domain commands.
import { BOOKING_CONSENTS, buildConsentSnapshot, REQUEST_CONSENTS } from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import type { QuoteCommand } from "@/lib/validation/quote";
import { preferredDateError } from "@/lib/validation/request";
import { recordAudit } from "@/server/audit";
import { findEnabledCategory } from "@/server/catalog/categories";
import { findPilotZip } from "@/server/catalog/pilot-zips";
import { addDays } from "@/server/clock";
import { REQUEST_TTL_DAYS } from "@/server/config";
import type { Viewer } from "@/server/context";
import { loadMechanicsForCustomer } from "@/server/customer/mechanic-public";
import { buildQuoteSnapshot } from "@/server/customer/snapshots";
import { writeTx, type Tx } from "@/server/db/tx";
import { newId } from "@/server/ids";
import { loadMechanicCandidates, loadRequestForMatching } from "@/server/matching/load";
import { evaluateMechanic } from "@/server/matching/rules";
import { quoteLines } from "@/server/mechanic/quotes";
import { computeBookingMoney, lineAmountCents } from "@/server/pricing";
import { discardStoredFiles, saveFile, type SavedFile } from "@/server/storage/uploads";

import { samplePhoto, type PhotoSpec } from "./images";
import { insertQuoteRows } from "./quotes";
import { parseRequestInput, type SampleRequestInput } from "./requests";
import type { SeedRun } from "./types";

export type BookedFixtureSpec = {
  customer: Viewer;
  mechanic: Viewer;
  submittedAt: Date;
  quotedAt: Date;
  /** When the sample booking was made and confirmed. */
  bookedAt: Date;
  request: SampleRequestInput;
  photos: readonly PhotoSpec[];
  /** Its earliestStartLocal is the booked slot. */
  quote: QuoteCommand;
};

export type BookedFixture = { requestId: string; quoteId: string; bookingId: string };

/**
 * The booked mechanic's matching record: evaluated with the real rules as of the submission
 * (and required to be eligible), notified first, and quoted. matched_count is 1.
 */
async function recordMatch(trx: Tx, requestId: string, mechanicId: string, submittedAt: Date, quotedAt: Date): Promise<void> {
  const request = await loadRequestForMatching(trx, requestId);
  const candidate = (await loadMechanicCandidates(trx)).find((mechanic) => mechanic.id === mechanicId);
  if (!request || !candidate) throw new Error(`Sample booking ${requestId}: request or mechanic missing`);
  const evaluation = evaluateMechanic(
    {
      point: request.point,
      categoryId: request.categoryId,
      categorySafetySensitive: request.categorySafetySensitive,
      make: request.vehicleMake,
      serviceMode: request.serviceMode,
      maxGarageDistanceMiles: request.maxGarageDistanceMiles,
      preferredDate: request.preferredDate,
      preferredWindow: request.preferredWindow,
      todayLocal: todayInZone(submittedAt, request.timeZone),
    },
    candidate,
  );
  if (!evaluation.eligible) {
    throw new Error(`Sample booking ${requestId}: ${candidate.displayName} would not match (${evaluation.reasons.join(", ")})`);
  }
  const submittedIso = submittedAt.toISOString();
  await trx
    .insertInto("match_evaluations")
    .values({
      request_id: requestId,
      mechanic_id: mechanicId,
      eligible: 1,
      notified: 1,
      distance_miles: evaluation.distanceMiles,
      reasons_json: JSON.stringify(evaluation.reasons),
      evaluated_at: submittedIso,
    })
    .execute();
  await trx
    .insertInto("job_matches")
    .values({
      id: newId(),
      request_id: requestId,
      mechanic_id: mechanicId,
      distance_miles: evaluation.distanceMiles,
      rank: 1,
      status: "quoted",
      notified_at: submittedIso,
      updated_at: quotedAt.toISOString(),
    })
    .execute();
  await trx.updateTable("repair_requests").set({ matched_count: 1 }).where("id", "=", requestId).execute();
}

/** Inserts one sample booking: request (with photos), match, selected quote, confirmed booking. */
export async function insertBookedFixture(run: SeedRun, spec: BookedFixtureSpec): Promise<BookedFixture> {
  run.assertPast(spec.bookedAt, "a sample booking");
  if (!(spec.submittedAt < spec.quotedAt && spec.quotedAt < spec.bookedAt)) {
    throw new Error("A sample booking must be submitted, then quoted, then booked.");
  }
  const input = parseRequestInput(spec.customer, spec.request, spec.submittedAt);
  const photos = await Promise.all(spec.photos.map((photo) => samplePhoto(photo)));
  const ctx = run.ctxAt(spec.submittedAt);
  const saved: SavedFile[] = [];
  const [submittedIso, bookedIso] = [spec.submittedAt.toISOString(), spec.bookedAt.toISOString()];

  try {
    return await writeTx(run.db, async (trx) => {
      const zip = await findPilotZip(trx, input.zip);
      const category = await findEnabledCategory(trx, input.categoryId);
      if (zip.status !== "ok" || !category) throw new Error(`Sample booking: ${input.zip} / ${input.categoryId} not available`);
      const location = zip.location;
      const dateError = preferredDateError(input.preferredDate, todayInZone(spec.submittedAt, location.timeZone));
      if (dateError) throw new Error(`Sample booking preferred date ${input.preferredDate}: ${dateError}`);
      const requestExpiresAt = addDays(spec.submittedAt, REQUEST_TTL_DAYS).toISOString();

      const requestId = newId();
      await trx
        .insertInto("repair_requests")
        .values({
          id: requestId,
          customer_id: spec.customer.id,
          status: "booked",
          zip: location.zip,
          approx_lat: location.lat,
          approx_lng: location.lng,
          area_label: location.areaLabel,
          time_zone: location.timeZone,
          vehicle_year: input.vehicleYear,
          vehicle_make: input.vehicleMake,
          vehicle_model: input.vehicleModel,
          mileage: input.mileage,
          category_id: input.categoryId,
          description: input.description,
          drivable: input.drivable ? 1 : 0,
          preferred_date: input.preferredDate,
          preferred_window: input.preferredWindow,
          service_mode: input.serviceMode,
          max_garage_distance_miles: input.maxGarageDistanceMiles,
          matched_count: 0,
          submitted_at: submittedIso,
          expires_at: requestExpiresAt,
          is_demo_fixture: 1,
          created_at: submittedIso,
          updated_at: bookedIso,
        })
        .execute();
      await trx
        .insertInto("request_private")
        .values({
          request_id: requestId,
          contact_email: input.contactEmail,
          contact_phone: input.contactPhone,
          street_address: input.streetAddress,
          address_city: input.city,
          address_state: input.state,
          location_notes: input.locationNotes,
          consent_snapshot_json: JSON.stringify(buildConsentSnapshot(REQUEST_CONSENTS, submittedIso)),
        })
        .execute();
      for (const photo of photos) {
        const file = await saveFile(trx, ctx, spec.customer.id, photo.prepared, "request_photo", photo.originalName);
        saved.push(file);
        await trx
          .insertInto("request_media")
          .values({ file_id: file.id, request_id: requestId, kind: "photo", shareable_before_booking: 1, created_at: submittedIso })
          .execute();
      }

      await recordMatch(trx, requestId, spec.mechanic.id, spec.submittedAt, spec.quotedAt);
      const quote = await insertQuoteRows(trx, {
        requestId,
        mechanicId: spec.mechanic.id,
        command: spec.quote,
        quotedAt: spec.quotedAt,
        timeZone: location.timeZone,
        requestExpiresAt,
        status: "selected",
        updatedAt: spec.bookedAt,
      });
      if (quote.expiresAt <= spec.bookedAt) throw new Error(`Sample booking ${requestId}: booked after the quote expired`);

      const point = { lat: location.lat, lng: location.lng };
      const mechanic = (await loadMechanicsForCustomer(trx, [spec.mechanic.id], point)).get(spec.mechanic.id);
      if (!mechanic) throw new Error(`Sample booking ${requestId}: mechanic ${spec.mechanic.id} not found`);
      const money = computeBookingMoney(quote.totals);
      const snapshot = buildQuoteSnapshot({
        computedAt: bookedIso,
        quote: {
          id: quote.quoteId,
          requestId,
          mechanicId: spec.mechanic.id,
          serviceMode: quote.command.serviceMode,
          partsIncluded: quote.command.partsIncluded,
          currency: "USD",
          slotStartAt: quote.slotStart.toISOString(),
          slotEndAt: quote.slotEnd.toISOString(),
          estimatedDurationMinutes: quote.command.durationMinutes,
          scope: quote.command.scope,
          exclusions: quote.command.exclusions,
          notes: quote.command.notes,
          quotedAt: spec.quotedAt.toISOString(),
          expiresAt: quote.expiresAt.toISOString(),
        },
        items: quoteLines(quote.command).map((line) => ({
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: lineAmountCents(line),
        })),
        mechanic: {
          id: mechanic.profile.id,
          displayName: mechanic.profile.displayName,
          yearsExperience: mechanic.profile.yearsExperience,
          certifications: mechanic.profile.certifications,
          areaLabel: mechanic.profile.areaLabel,
          services: mechanic.profile.services,
        },
        totals: money,
      });

      const bookingId = newId();
      await trx
        .insertInto("bookings")
        .values({
          id: bookingId,
          request_id: requestId,
          quote_id: quote.quoteId,
          customer_id: spec.customer.id,
          mechanic_id: spec.mechanic.id,
          status: "confirmed",
          payment_state: "demo_fixture_no_real_payment",
          payout_status: "not_eligible",
          service_mode: quote.command.serviceMode,
          slot_start_at: quote.slotStart.toISOString(),
          slot_end_at: quote.slotEnd.toISOString(),
          currency: "USD",
          labor_cents: money.laborCents,
          parts_cents: money.partsCents,
          tax_cents: money.taxCents,
          fee_cents: money.feeCents,
          total_cents: money.totalCents,
          platform_fee_bps: money.platformFeeBps,
          platform_fee_cents: money.platformFeeCents,
          mechanic_payout_cents: money.mechanicPayoutCents,
          quote_snapshot_json: JSON.stringify(snapshot),
          consent_snapshot_json: JSON.stringify(buildConsentSnapshot(BOOKING_CONSENTS, bookedIso)),
          is_demo_fixture: 1,
          created_at: bookedIso,
          updated_at: bookedIso,
          confirmed_at: bookedIso,
        })
        .execute();
      // The audit log says plainly where this booking came from.
      await recordAudit(trx, {
        actor: "system",
        action: "booking.demo_fixture_created",
        entityType: "booking",
        entityId: bookingId,
        metadata: {
          requestId,
          quoteId: quote.quoteId,
          mechanicId: spec.mechanic.id,
          totalCents: money.totalCents,
          note: "Sample booking loaded by the seed script: confirmed without any online payment (online payments are not connected yet).",
        },
        at: spec.bookedAt,
      });
      return { requestId, quoteId: quote.quoteId, bookingId };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}
