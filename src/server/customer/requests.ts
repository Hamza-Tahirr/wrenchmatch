import "server-only";

import { buildConsentSnapshot, REQUEST_CONSENTS, REQUEST_STATUSES, type RequestStatus } from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import {
  cancelRequestSchema,
  createRepairRequestSchema,
  fieldErrorsFromZod,
  preferredDateError,
  type FieldErrors,
  type RepairRequestInput,
} from "@/lib/validation/request";
import { recordAudit } from "@/server/audit";
import { assertWithinRateLimit } from "@/server/auth/rate-limit";
import { findEnabledCategory } from "@/server/catalog/categories";
import { findPilotZip, listPilotAreas, pilotZipMessage, type PilotZipLocation } from "@/server/catalog/pilot-zips";
import { addDays } from "@/server/clock";
import { REQUEST_TTL_DAYS } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { newId } from "@/server/ids";
import { runMatching } from "@/server/matching/run";
import { notify } from "@/server/notifications/notify";
import { discardStoredFiles, saveFile, type SavedFile } from "@/server/storage/uploads";

import { assertCustomer, notFound } from "./access";
import { activeAdminIds } from "./admin-recipients";
import { invalidFields } from "./form-errors";
import {
  noMatchAdminNotice,
  requestCancelledMechanicNotice,
  requestSubmittedNotice,
  type RequestFacts,
} from "./messages";
import { NO_REQUEST_UPLOADS, requestUploadErrors, type RequestUploads } from "./request-uploads";
import { loadRequestDetail, loadRequestSummaries, type RequestDetail, type RequestSummary } from "./request-views";
import { oneOf, vehicleLabel } from "./rows";

// The customer's repair requests: submit (validate, store, match, notify), cancel, list, view.

export type SubmitRepairRequestResult = {
  requestId: string;
  /** The actual number of mechanics notified (0 is a real outcome; admins are alerted). */
  matchedCount: number;
};

export type CancelRequestResult = {
  requestId: string;
  declinedQuoteCount: number;
  notifiedMechanicCount: number;
};

/** Field errors for the server-only rules: enabled category, pilot ZIP, date window in the ZIP's zone. */
async function checkReferenceData(
  trx: Tx,
  now: Date,
  input: RepairRequestInput,
): Promise<{ categoryName: string; zip: PilotZipLocation }> {
  const fieldErrors: FieldErrors = {};
  const category = await findEnabledCategory(trx, input.categoryId);
  if (!category) fieldErrors.categoryId = ["That kind of repair isn't available right now. Choose another one."];

  const zip = await findPilotZip(trx, input.zip);
  if (zip.status !== "ok") {
    fieldErrors.zip = [pilotZipMessage(zip, await listPilotAreas(trx))];
  } else {
    const dateError = preferredDateError(input.preferredDate, todayInZone(now, zip.location.timeZone));
    if (dateError) fieldErrors.preferredDate = [dateError];
  }

  if (!category || zip.status !== "ok" || Object.keys(fieldErrors).length > 0) throw invalidFields(fieldErrors);
  return { categoryName: category.name, zip: zip.location };
}

/**
 * Submits a repair request in one transaction: rate limit (10 per customer per hour), the
 * category and pilot-ZIP checks, the draft request and its private row (contact, address,
 * consent snapshot), the uploads (photos shared with matched mechanics, the video never
 * before a confirmed booking), then open + 7-day expiry, matching, a notification to the
 * customer with the actual count and, when nobody matched, an alert to every admin.
 *
 * `uploads` come from prepareRequestUploads (already validated and sanitized); their counts
 * and types are checked again. If anything fails, files already written are removed.
 * Throws DomainError: forbidden (not a customer), invalid_input (with details.fieldErrors),
 * rate_limited.
 */
export async function submitRepairRequest(
  ctx: AppContext,
  viewer: Viewer,
  input: RepairRequestInput,
  uploads: RequestUploads = NO_REQUEST_UPLOADS,
): Promise<SubmitRepairRequestResult> {
  assertCustomer(viewer);
  const parsed = createRepairRequestSchema({ now: ctx.now }).safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const data = parsed.data;
  const uploadErrors = requestUploadErrors(uploads);
  if (Object.keys(uploadErrors).length > 0) throw invalidFields(uploadErrors);

  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      await assertWithinRateLimit({ db: trx, now: ctx.now }, "request_submit", viewer.id);
      const { categoryName, zip } = await checkReferenceData(trx, ctx.now, data);

      const requestId = newId();
      const nowIso = ctx.now.toISOString();
      await trx
        .insertInto("repair_requests")
        .values({
          id: requestId,
          customer_id: viewer.id,
          status: "draft",
          zip: zip.zip,
          approx_lat: zip.lat,
          approx_lng: zip.lng,
          area_label: zip.areaLabel,
          time_zone: zip.timeZone,
          vehicle_year: data.vehicleYear,
          vehicle_make: data.vehicleMake,
          vehicle_model: data.vehicleModel,
          mileage: data.mileage,
          category_id: data.categoryId,
          description: data.description,
          drivable: data.drivable ? 1 : 0,
          preferred_date: data.preferredDate,
          preferred_window: data.preferredWindow,
          service_mode: data.serviceMode,
          max_garage_distance_miles: data.maxGarageDistanceMiles,
          matched_count: 0,
          is_demo_fixture: 0,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .execute();
      await trx
        .insertInto("request_private")
        .values({
          request_id: requestId,
          contact_email: data.contactEmail,
          contact_phone: data.contactPhone,
          street_address: data.streetAddress,
          address_city: data.city,
          address_state: data.state,
          location_notes: data.locationNotes,
          consent_snapshot_json: JSON.stringify(buildConsentSnapshot(REQUEST_CONSENTS, nowIso)),
        })
        .execute();

      const media = [
        ...uploads.photos.map((upload) => ({ upload, purpose: "request_photo" as const, kind: "photo" as const })),
        ...uploads.videos.map((upload) => ({ upload, purpose: "request_video" as const, kind: "video" as const })),
      ];
      for (const { upload, purpose, kind } of media) {
        const file = await saveFile(trx, ctx, viewer.id, upload.prepared, purpose, upload.originalName);
        saved.push(file);
        await trx
          .insertInto("request_media")
          .values({
            file_id: file.id,
            request_id: requestId,
            kind,
            // Only metadata-stripped photos may be shown to matched mechanics before booking.
            shareable_before_booking: kind === "photo" ? 1 : 0,
            created_at: nowIso,
          })
          .execute();
      }

      await trx
        .updateTable("repair_requests")
        .set({
          status: "open",
          submitted_at: nowIso,
          expires_at: addDays(ctx.now, REQUEST_TTL_DAYS).toISOString(),
          updated_at: nowIso,
        })
        .where("id", "=", requestId)
        .execute();

      const matching = await runMatching(trx, { requestId, now: ctx.now, mode: "initial" });
      const matchedCount = matching.notifiedCount;
      const facts: RequestFacts = {
        requestId,
        categoryName,
        vehicle: vehicleLabel(data.vehicleYear, data.vehicleMake, data.vehicleModel),
        city: zip.city,
        state: zip.state,
      };

      await notify(trx, { userId: viewer.id, ...requestSubmittedNotice(facts, matchedCount), at: ctx.now });
      if (matchedCount === 0) {
        const notice = noMatchAdminNotice(facts);
        for (const adminId of await activeAdminIds(trx)) await notify(trx, { userId: adminId, ...notice, at: ctx.now });
      }

      await recordAudit(trx, {
        actor: viewer,
        action: "request.submit",
        entityType: "request",
        entityId: requestId,
        metadata: {
          categoryId: data.categoryId,
          serviceMode: data.serviceMode,
          matchedCount,
          eligibleCount: matching.eligibleCount,
          photoCount: uploads.photos.length,
          videoCount: uploads.videos.length,
        },
        at: ctx.now,
      });
      return { requestId, matchedCount };
    });
  } catch (error) {
    // The transaction rolled back the files rows; remove the bytes written to storage.
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}

function cannotCancel(status: RequestStatus): DomainError {
  switch (status) {
    case "reserved":
      return new DomainError(
        "conflict",
        "This request has a pending reservation. Cancel the reservation from its booking page instead.",
      );
    case "booked":
      return new DomainError(
        "conflict",
        "This request is booked. To cancel a confirmed booking, open a help request.",
      );
    case "expired":
      return new DomainError("conflict", "This request has already expired.");
    case "cancelled":
      return new DomainError("conflict", "This request is already cancelled.");
    default:
      return new DomainError("conflict", "This request can't be cancelled.");
  }
}

/**
 * Cancels one of the viewer's open or quoted requests: submitted quotes become declined
 * and every mechanic who was notified (or quoted) hears about it. Throws DomainError:
 * not_found (missing or someone else's), conflict (not open/quoted), invalid_input.
 */
export async function cancelRequest(
  ctx: AppContext,
  viewer: Viewer,
  input: { requestId: string; reason?: string | null },
): Promise<CancelRequestResult> {
  assertCustomer(viewer);
  const parsed = cancelRequestSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const { requestId, reason } = parsed.data;

  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const request = await trx
      .selectFrom("repair_requests as r")
      .innerJoin("service_categories as c", "c.id", "r.category_id")
      .innerJoin("zip_centroids as z", "z.zip", "r.zip")
      .select([
        "r.id",
        "r.status",
        "r.vehicle_year",
        "r.vehicle_make",
        "r.vehicle_model",
        "c.name as category_name",
        "z.city",
        "z.state",
      ])
      .where("r.id", "=", requestId)
      .where("r.customer_id", "=", viewer.id)
      .executeTakeFirst();
    if (!request) throw notFound("request");
    const status = oneOf(REQUEST_STATUSES, request.status, "repair_requests.status");
    if (status !== "open" && status !== "quoted") throw cannotCancel(status);

    const nowIso = ctx.now.toISOString();
    const declined = await trx
      .updateTable("quotes")
      .set({ status: "declined", updated_at: nowIso })
      .where("request_id", "=", requestId)
      .where("status", "=", "submitted")
      .returning(["id", "mechanic_id"])
      .execute();
    await trx
      .updateTable("repair_requests")
      .set({ status: "cancelled", updated_at: nowIso })
      .where("id", "=", requestId)
      .execute();

    const matched = await trx
      .selectFrom("job_matches")
      .select("mechanic_id")
      .where("request_id", "=", requestId)
      .orderBy("rank")
      .execute();
    const quotedIds = new Set(declined.map((quote) => quote.mechanic_id));
    const mechanicIds = [...new Set([...matched.map((row) => row.mechanic_id), ...quotedIds])];
    const facts: RequestFacts = {
      requestId,
      categoryName: request.category_name,
      vehicle: vehicleLabel(request.vehicle_year, request.vehicle_make, request.vehicle_model),
      city: request.city,
      state: request.state,
    };
    for (const mechanicId of mechanicIds) {
      const notice = requestCancelledMechanicNotice(facts, quotedIds.has(mechanicId));
      await notify(trx, { userId: mechanicId, ...notice, at: ctx.now });
    }

    await recordAudit(trx, {
      actor: viewer,
      action: "request.cancel",
      entityType: "request",
      entityId: requestId,
      reason,
      metadata: { previousStatus: status, declinedQuoteIds: declined.map((quote) => quote.id) },
      at: ctx.now,
    });
    return { requestId, declinedQuoteCount: declined.length, notifiedMechanicCount: mechanicIds.length };
  });
}

/** The viewer's requests, newest first, with effective statuses, match and quote counts. */
export async function listMyRequests(ctx: AppContext, viewer: Viewer): Promise<RequestSummary[]> {
  assertCustomer(viewer);
  return loadRequestSummaries(ctx, viewer);
}

/**
 * One of the viewer's requests: details, own contact/address and consent record, media,
 * quote comparison, reservation summary and timeline. Someone else's request: not_found.
 */
export async function getMyRequest(ctx: AppContext, viewer: Viewer, requestId: string): Promise<RequestDetail> {
  assertCustomer(viewer);
  return loadRequestDetail(ctx, viewer, requestId);
}
