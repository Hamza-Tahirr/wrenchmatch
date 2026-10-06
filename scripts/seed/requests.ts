// Sample repair requests. Open requests are submitted with submitRepairRequest itself (the same
// validation, pilot-ZIP check, consent snapshot, sanitized photos, genuine matching,
// notifications and audit as in the app) and then flagged as seeded fixtures (internal flag).
import {
  REQUEST_CONSENTS,
  type GarageDistanceMiles,
  type PreferredWindow,
  type RequestServiceMode,
  type VehicleMake,
} from "@/lib/domain";
import { createRepairRequestSchema, type RepairRequestInput } from "@/lib/validation/request";
import type { Viewer } from "@/server/context";
import { submitRepairRequest } from "@/server/customer/requests";
import { writeTx } from "@/server/db/tx";

import { samplePhoto, type PhotoSpec } from "./images";
import type { SeedRun } from "./types";

export type SampleRequestInput = {
  zip: string;
  vehicleYear: number;
  vehicleMake: VehicleMake;
  vehicleModel: string;
  mileage: number;
  categoryId: string;
  description: string;
  drivable: boolean;
  preferredDate: string;
  preferredWindow: PreferredWindow;
  serviceMode: RequestServiceMode;
  /** Default 15 (the form's default). */
  maxGarageDistanceMiles?: GarageDistanceMiles;
  contactPhone: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  locationNotes: string | null;
};

/** The request form's typed input, validated by the app's own schema as of `at`. */
export function parseRequestInput(customer: Viewer, input: SampleRequestInput, at: Date): RepairRequestInput {
  return createRepairRequestSchema({ now: at }).parse({
    zip: input.zip,
    streetAddress: input.streetAddress,
    city: input.city,
    state: input.state,
    locationNotes: input.locationNotes,
    vehicleYear: input.vehicleYear,
    vehicleMake: input.vehicleMake,
    vehicleModel: input.vehicleModel,
    mileage: input.mileage,
    categoryId: input.categoryId,
    description: input.description,
    drivable: input.drivable,
    preferredDate: input.preferredDate,
    preferredWindow: input.preferredWindow,
    serviceMode: input.serviceMode,
    maxGarageDistanceMiles: input.maxGarageDistanceMiles,
    contactPhone: input.contactPhone,
    contactEmail: customer.email,
    acceptedConsentKeys: REQUEST_CONSENTS.map((consent) => consent.key),
  });
}

export type SubmittedSampleRequest = { requestId: string; matchedCount: number };

/** Submits a request as `customer` at `at`, with generated photos, and flags it as seeded. */
export async function submitSampleRequest(
  run: SeedRun,
  customer: Viewer,
  options: { at: Date; request: SampleRequestInput; photos: readonly PhotoSpec[] },
): Promise<SubmittedSampleRequest> {
  const photos = await Promise.all(options.photos.map((spec) => samplePhoto(spec)));
  const result = await submitRepairRequest(
    run.ctxAt(options.at),
    customer,
    parseRequestInput(customer, options.request, options.at),
    { photos, videos: [] },
  );
  await writeTx(run.db, async (trx) => {
    await trx.updateTable("repair_requests").set({ is_demo_fixture: 1 }).where("id", "=", result.requestId).execute();
  });
  return result;
}
