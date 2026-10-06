"use server";

import {
  categoryToggleSchema,
  pilotZipFormSchema,
  pilotZipToggleSchema,
  zipCodeSchema,
  type AdminActionState,
} from "@/lib/validation/admin";
import { setCategoryEnabled } from "@/server/admin/categories";
import { getZipCentroid, setPilotZipEnabled, upsertPilotZip } from "@/server/admin/pilot-zips";
import { createAppContext } from "@/server/context";

import { requireAdminForAction, runAdminAction } from "../_lib/run-action";

const settingsPath = () => "/admin/settings";

export async function setCategoryEnabledAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: categoryToggleSchema,
    path: settingsPath,
    run: (ctx, viewer, data) => setCategoryEnabled(ctx, viewer, data),
    success: (result) => {
      if (!result.changed) return "Nothing changed: the category was already in that state.";
      return result.enabled
        ? "Category enabled. Customers can choose it on the request form again."
        : "Category disabled. It is hidden from new requests; requests already submitted continue.";
    },
  });
}

export async function setPilotZipEnabledAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: pilotZipToggleSchema,
    path: settingsPath,
    run: (ctx, viewer, data) => setPilotZipEnabled(ctx, viewer, data),
    success: (result) => {
      if (!result.changed) return `Nothing changed: ZIP ${result.zip} was already ${result.enabled ? "enabled" : "disabled"}.`;
      return result.enabled
        ? `ZIP ${result.zip} enabled. Customers there can send requests again.`
        : `ZIP ${result.zip} disabled. New requests from it are refused; existing ones continue.`;
    },
  });
}

export async function savePilotZipAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction({
    formData,
    schema: pilotZipFormSchema,
    path: settingsPath,
    run: (ctx, viewer, data) => upsertPilotZip(ctx, viewer, data),
    success: (result, data) => {
      const location =
        result.centroid === "added"
          ? " Its approximate location was saved."
          : result.centroid === "updated"
            ? " Its approximate location was corrected."
            : "";
      const state = data.enabled ? "enabled" : "saved as disabled";
      return result.created
        ? `ZIP ${result.zip} added to the pilot area (${state}).${location}`
        : `ZIP ${result.zip} updated (${state}).${location}`;
    },
  });
}

/** What the pilot ZIP form should ask for, looked up when the admin types a ZIP. */
export type ZipLookup =
  | { status: "invalid" }
  | { status: "unknown"; zip: string }
  | {
      status: "known";
      zip: string;
      city: string;
      state: string;
      /** The approximate centroid on file (previewed on the coverage map before saving). */
      lat: number;
      lng: number;
      timeZone: string;
      source: string;
      /** Admin-entered centroids can be corrected; reference ones cannot. */
      editable: boolean;
      /** null when the ZIP is not a pilot ZIP yet. */
      pilotEnabled: boolean | null;
    };

export async function lookupZipAction(zip: string): Promise<ZipLookup> {
  const viewer = await requireAdminForAction("/admin/settings");
  const parsed = zipCodeSchema.safeParse(zip);
  if (!parsed.success) return { status: "invalid" };
  const centroid = await getZipCentroid(createAppContext(), viewer, parsed.data);
  if (!centroid) return { status: "unknown", zip: parsed.data };
  return {
    status: "known",
    zip: centroid.zip,
    city: centroid.city,
    state: centroid.state,
    lat: centroid.lat,
    lng: centroid.lng,
    timeZone: centroid.timeZone,
    source: centroid.source,
    editable: centroid.editable,
    pilotEnabled: centroid.pilotEnabled,
  };
}
