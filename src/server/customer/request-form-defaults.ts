import "server-only";

import { sql } from "kysely";

import { todayInZone } from "@/lib/time";
import { preferredDateError, type RequestFormValues } from "@/lib/validation/request";
import { findEnabledCategory } from "@/server/catalog/categories";
import type { AppContext, Viewer } from "@/server/context";

import { assertCustomer, notFound } from "./access";

// Starting values for the repair-request form, so returning customers don't retype their
// details: the contact and location of their latest request, or (to "request again" after
// an expired, cancelled or unmatched request) a whole previous request. Only the customer's
// own records are read. Consents are never pre-ticked; they must be given each time.

export type RequestFormDefaults = {
  /** defaultValue strings, in the same shape as the values echoed back after a failed submit. */
  values: RequestFormValues;
  /**
   * "account": the account email only (first request); "last_request": contact and location
   * from the customer's latest request; "copied_request": a previous request copied in full.
   */
  source: "account" | "last_request" | "copied_request";
  copiedFromRequestId: string | null;
  /** Copied fields left empty because they no longer apply (a disabled category, a past date). */
  notCopied: ("categoryId" | "preferredDate")[];
};

type TextValues = { [Field in keyof Omit<RequestFormValues, "acceptedConsentKeys">]?: string | null };

/** Keeps only the values that are present (non-empty strings). */
function present(values: TextValues): RequestFormValues {
  const result: RequestFormValues = {};
  for (const field of Object.keys(values) as (keyof TextValues)[]) {
    const value = values[field];
    if (typeof value === "string" && value !== "") result[field] = value;
  }
  return result;
}

/**
 * Defaults for the request form. Pass `fromRequestId` to copy one of the customer's own
 * requests (someone else's: DomainError not_found); without it, the latest request's
 * contact and location are used, or just the account email for a first request.
 */
export async function getRequestFormDefaults(
  ctx: AppContext,
  viewer: Viewer,
  options: { fromRequestId?: string | null } = {},
): Promise<RequestFormDefaults> {
  assertCustomer(viewer);
  const query = ctx.db
    .selectFrom("repair_requests as r")
    .innerJoin("request_private as p", "p.request_id", "r.id")
    .select([
      "r.id",
      "r.zip",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "r.mileage",
      "r.category_id",
      "r.description",
      "r.drivable",
      "r.preferred_date",
      "r.preferred_window",
      "r.service_mode",
      "r.max_garage_distance_miles",
      "p.contact_email",
      "p.contact_phone",
      "p.street_address",
      "p.address_city",
      "p.address_state",
      "p.location_notes",
    ])
    .where("r.customer_id", "=", viewer.id);

  const fromRequestId = options.fromRequestId ?? null;
  const row = fromRequestId
    ? await query.where("r.id", "=", fromRequestId).executeTakeFirst()
    : await query.orderBy("r.created_at", "desc").orderBy(sql`r.rowid`, "desc").executeTakeFirst();
  if (fromRequestId && !row) throw notFound("request");
  if (!row) {
    return { values: { contactEmail: viewer.email }, source: "account", copiedFromRequestId: null, notCopied: [] };
  }

  const contact = {
    zip: row.zip,
    streetAddress: row.street_address,
    city: row.address_city,
    state: row.address_state,
    locationNotes: row.location_notes,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
  };
  if (!fromRequestId) {
    return { values: present(contact), source: "last_request", copiedFromRequestId: null, notCopied: [] };
  }

  const notCopied: RequestFormDefaults["notCopied"] = [];
  const categoryEnabled = (await findEnabledCategory(ctx.db, row.category_id)) !== undefined;
  if (!categoryEnabled) notCopied.push("categoryId");
  const dateStillValid = preferredDateError(row.preferred_date, todayInZone(ctx.now, row.time_zone)) === null;
  if (!dateStillValid) notCopied.push("preferredDate");

  return {
    values: present({
      ...contact,
      vehicleYear: String(row.vehicle_year),
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      mileage: String(row.mileage),
      categoryId: categoryEnabled ? row.category_id : null,
      description: row.description,
      drivable: row.drivable === 1 ? "yes" : "no",
      preferredDate: dateStillValid ? row.preferred_date : null,
      preferredWindow: row.preferred_window,
      serviceMode: row.service_mode,
      maxGarageDistanceMiles: String(row.max_garage_distance_miles),
    }),
    source: "copied_request",
    copiedFromRequestId: row.id,
    notCopied,
  };
}
