import "server-only";

import { todayInZone } from "@/lib/time";
import {
  acceptingJobsCommandSchema,
  mechanicAvailabilityCommandSchema,
  mechanicDocumentCommandSchema,
  mechanicProfileCommandSchema,
  mechanicServicesCommandSchema,
  type AcceptingJobsCommand,
  type MechanicAvailabilityCommand,
  type MechanicDocumentCommand,
  type MechanicProfileCommand,
  type MechanicServicesCommand,
} from "@/lib/validation/mechanic";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { newId } from "@/server/ids";
import { discardStoredFiles, saveFile, type SavedFile } from "@/server/storage/uploads";

import { requireMechanicState } from "./access";
import { documentUploadedMessage } from "./messages";
import { DomainError } from "@/server/errors";
import {
  assertInsuranceInFuture,
  notifyAdmins,
  parseCommand,
  replaceAvailability,
  replaceMakes,
  replaceServices,
  requireBaseZip,
  resolveCategories,
} from "./shared";
import { assertUploadFor, type MechanicUpload } from "./uploads";

// Changes a mechanic makes to their own profile. Each works in any application status (an
// applicant or a rejected mechanic fixes details before review/resubmission; an approved
// mechanic keeps them current) and is recorded in the audit log without private values.

export type UpdateProfileResult = { changedFields: string[] };

/**
 * Once an admin has reviewed the application, the insurance on file (which gates matching,
 * the job board, quoting and reservations) changes only when an admin verifies an uploaded
 * insurance certificate (admin reviewDocument), never through this form.
 */
const INSURANCE_LOCKED_STATUSES: ReadonlySet<string> = new Set(["under_review", "approved", "suspended"]);

export const INSURANCE_LOCKED_MESSAGE =
  "To update your insurance, upload your new insurance certificate with its expiry date under Documents. An admin verifies it and updates your profile.";

/**
 * Saves the profile form: public fields, private details, service area and insurance. A new
 * base ZIP must have a centroid and moves the approximate base point. Before admin review the
 * insurance must expire after today (in the base ZIP's time zone); from review onwards it is
 * read-only here (INSURANCE_LOCKED_STATUSES). Throws DomainError "invalid_input" with
 * details.fieldErrors (baseZip, insuranceExpiresOn, ...).
 */
export async function updateProfile(
  ctx: AppContext,
  viewer: Viewer,
  input: MechanicProfileCommand,
): Promise<UpdateProfileResult> {
  const command = parseCommand(mechanicProfileCommandSchema, input);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const state = await requireMechanicState(trx, viewer);
    const zip = await requireBaseZip(trx, command.baseZip);
    const insuranceLocked = INSURANCE_LOCKED_STATUSES.has(state.status);
    if (!insuranceLocked) assertInsuranceInFuture(command.insuranceExpiresOn, todayInZone(ctx.now, zip.timeZone));

    const before = await trx
      .selectFrom("mechanic_profiles as p")
      .leftJoin("mechanic_private as m", "m.user_id", "p.user_id")
      .select([
        "p.display_name",
        "p.bio",
        "p.years_experience",
        "p.certifications",
        "p.service_mode",
        "p.travel_radius_miles",
        "p.base_zip",
        "p.insurance_provider",
        "p.insurance_expires_on",
        "m.user_id as private_id",
        "m.legal_name",
        "m.business_name",
        "m.phone",
        "m.contact_email",
        "m.garage_address_line1",
        "m.garage_city",
        "m.garage_state",
        "m.garage_zip",
        "m.insurance_policy_number",
      ])
      .where("p.user_id", "=", viewer.id)
      .executeTakeFirstOrThrow();

    if (insuranceLocked) {
      const insuranceFieldErrors: Record<string, string[]> = {};
      if ((command.insuranceProvider ?? null) !== (before.insurance_provider ?? null)) {
        insuranceFieldErrors.insuranceProvider = [INSURANCE_LOCKED_MESSAGE];
      }
      if ((command.insuranceExpiresOn ?? null) !== (before.insurance_expires_on ?? null)) {
        insuranceFieldErrors.insuranceExpiresOn = [INSURANCE_LOCKED_MESSAGE];
      }
      if ((command.insurancePolicyNumber ?? null) !== (before.insurance_policy_number ?? null)) {
        insuranceFieldErrors.insurancePolicyNumber = [INSURANCE_LOCKED_MESSAGE];
      }
      if (Object.keys(insuranceFieldErrors).length > 0) {
        throw new DomainError("invalid_input", INSURANCE_LOCKED_MESSAGE, { fieldErrors: insuranceFieldErrors });
      }
    }

    const garage = command.garageAddress;
    const next = {
      displayName: command.displayName,
      bio: command.bio,
      yearsExperience: command.yearsExperience,
      certifications: command.certifications,
      serviceMode: command.serviceMode,
      travelRadiusMiles: command.travelRadiusMiles,
      baseZip: zip.zip,
      insuranceProvider: command.insuranceProvider,
      insuranceExpiresOn: command.insuranceExpiresOn,
      legalName: command.legalName,
      businessName: command.businessName,
      phone: command.phone,
      contactEmail: command.contactEmail,
      garageAddress: garage ? `${garage.line1}|${garage.city}|${garage.state}|${garage.zip}` : null,
      insurancePolicyNumber: command.insurancePolicyNumber,
    };
    const previous: Record<keyof typeof next, unknown> = {
      displayName: before.display_name,
      bio: before.bio,
      yearsExperience: before.years_experience,
      certifications: before.certifications,
      serviceMode: before.service_mode,
      travelRadiusMiles: before.travel_radius_miles,
      baseZip: before.base_zip,
      insuranceProvider: before.insurance_provider,
      insuranceExpiresOn: before.insurance_expires_on,
      legalName: before.legal_name,
      businessName: before.business_name,
      phone: before.phone,
      contactEmail: before.contact_email,
      garageAddress: before.garage_address_line1
        ? `${before.garage_address_line1}|${before.garage_city}|${before.garage_state}|${before.garage_zip}`
        : null,
      insurancePolicyNumber: before.insurance_policy_number,
    };
    const changedFields = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== previous[key]);

    await trx
      .updateTable("mechanic_profiles")
      .set({
        display_name: command.displayName,
        bio: command.bio,
        years_experience: command.yearsExperience,
        certifications: command.certifications,
        service_mode: command.serviceMode,
        travel_radius_miles: command.travelRadiusMiles,
        base_zip: zip.zip,
        base_lat: zip.lat,
        base_lng: zip.lng,
        insurance_provider: command.insuranceProvider,
        insurance_expires_on: command.insuranceExpiresOn,
        updated_at: nowIso,
      })
      .where("user_id", "=", viewer.id)
      .execute();

    const privateValues = {
      legal_name: command.legalName,
      business_name: command.businessName,
      phone: command.phone,
      contact_email: command.contactEmail,
      garage_address_line1: garage?.line1 ?? null,
      garage_city: garage?.city ?? null,
      garage_state: garage?.state ?? null,
      garage_zip: garage?.zip ?? null,
      insurance_policy_number: command.insurancePolicyNumber,
      updated_at: nowIso,
    };
    if (before.private_id) {
      await trx.updateTable("mechanic_private").set(privateValues).where("user_id", "=", viewer.id).execute();
    } else {
      await trx.insertInto("mechanic_private").values({ user_id: viewer.id, ...privateValues }).execute();
    }

    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.profile_update",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { changedFields },
      at: ctx.now,
    });
    return { changedFields };
  });
}

export type UpdateServicesResult = {
  added: string[];
  removed: string[];
  /** Safety-sensitive services (offered now) still waiting for an admin safety review. */
  pendingSafetyReview: string[];
};

/**
 * Replaces the services offered and the makes serviced. Kept services keep their safety
 * approval; newly added safety-sensitive services start unapproved and admins are notified
 * to review them. New categories must be enabled; a since-disabled one may be kept.
 */
export async function updateServicesAndMakes(
  ctx: AppContext,
  viewer: Viewer,
  input: MechanicServicesCommand,
): Promise<UpdateServicesResult> {
  const command = parseCommand(mechanicServicesCommandSchema, input);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const state = await requireMechanicState(trx, viewer);
    const offered = new Set(
      (
        await trx.selectFrom("mechanic_services").select("category_id").where("mechanic_id", "=", viewer.id).execute()
      ).map((row) => row.category_id),
    );
    const categories = await resolveCategories(trx, command.services, offered);
    const { added, removed } = await replaceServices(
      trx,
      viewer.id,
      categories.map((category) => category.id),
    );
    await replaceMakes(trx, viewer.id, command.allMakes, command.makes);
    await trx
      .updateTable("mechanic_profiles")
      .set({ services_all_makes: command.allMakes ? 1 : 0, updated_at: nowIso })
      .where("user_id", "=", viewer.id)
      .execute();

    const pending = await trx
      .selectFrom("mechanic_services as s")
      .innerJoin("service_categories as c", "c.id", "s.category_id")
      .select(["c.id", "c.name"])
      .where("s.mechanic_id", "=", viewer.id)
      .where("c.safety_sensitive", "=", 1)
      .where("s.safety_approved", "=", 0)
      .orderBy("c.sort_order")
      .execute();
    const newlyPending = pending.filter((category) => added.includes(category.id));
    if (newlyPending.length > 0) {
      await notifyAdmins(
        trx,
        {
          type: "mechanic.safety_review_requested",
          title: `Safety review needed: ${state.displayName}`,
          body: `${state.displayName} added ${newlyPending.map((category) => category.name).join(" and ")}. Approve it on their profile before they can receive those jobs.`,
          linkPath: `/admin/mechanics/${viewer.id}`,
        },
        ctx.now,
      );
    }
    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.services_update",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { added, removed, allMakes: command.allMakes, makeCount: command.makes.length },
      at: ctx.now,
    });
    return { added, removed, pendingSafetyReview: pending.map((category) => category.id) };
  });
}

/** Replaces the weekly availability windows (at least one). */
export async function setAvailability(
  ctx: AppContext,
  viewer: Viewer,
  input: MechanicAvailabilityCommand,
): Promise<{ windowCount: number }> {
  const command = parseCommand(mechanicAvailabilityCommandSchema, input);
  return writeTx(ctx.db, async (trx) => {
    await requireMechanicState(trx, viewer);
    await replaceAvailability(trx, viewer.id, command.windows);
    await trx
      .updateTable("mechanic_profiles")
      .set({ updated_at: ctx.now.toISOString() })
      .where("user_id", "=", viewer.id)
      .execute();
    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.availability_update",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { windowCount: command.windows.length },
      at: ctx.now,
    });
    return { windowCount: command.windows.length };
  });
}

/** Pauses or resumes new jobs. Paused mechanics are not matched and see no job cards. */
export async function setAcceptingJobs(
  ctx: AppContext,
  viewer: Viewer,
  input: AcceptingJobsCommand,
): Promise<{ acceptingJobs: boolean }> {
  const command = parseCommand(acceptingJobsCommandSchema, input);
  return writeTx(ctx.db, async (trx) => {
    const state = await requireMechanicState(trx, viewer);
    if (state.acceptingJobs !== command.acceptingJobs) {
      await trx
        .updateTable("mechanic_profiles")
        .set({ accepting_jobs: command.acceptingJobs ? 1 : 0, updated_at: ctx.now.toISOString() })
        .where("user_id", "=", viewer.id)
        .execute();
      await recordAudit(trx, {
        actor: viewer,
        action: command.acceptingJobs ? "mechanic.resume_jobs" : "mechanic.pause_jobs",
        entityType: "mechanic",
        entityId: viewer.id,
        at: ctx.now,
      });
    }
    return { acceptingJobs: command.acceptingJobs };
  });
}

/**
 * Adds a document (pending admin review), e.g. a renewed insurance certificate. `upload`
 * comes from prepareDocumentUpload. Admins are notified.
 */
export async function addDocument(
  ctx: AppContext,
  viewer: Viewer,
  input: MechanicDocumentCommand,
  upload: MechanicUpload,
): Promise<{ documentId: string; fileId: string }> {
  const command = parseCommand(mechanicDocumentCommandSchema, input);
  assertUploadFor(upload, "mechanic_document", "document");
  const nowIso = ctx.now.toISOString();
  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      const state = await requireMechanicState(trx, viewer);
      const file = await saveFile(trx, ctx, viewer.id, upload.prepared, "mechanic_document", upload.originalName);
      saved.push(file);
      const documentId = newId();
      await trx
        .insertInto("mechanic_documents")
        .values({
          id: documentId,
          mechanic_id: viewer.id,
          file_id: file.id,
          kind: command.kind,
          status: "pending",
          expires_on: command.expiresOn,
          created_at: nowIso,
        })
        .execute();
      await notifyAdmins(
        trx,
        documentUploadedMessage({ mechanicId: viewer.id, displayName: state.displayName, kind: command.kind }),
        ctx.now,
      );
      await recordAudit(trx, {
        actor: viewer,
        action: "mechanic_document.add",
        entityType: "mechanic_document",
        entityId: documentId,
        metadata: { kind: command.kind, fileId: file.id },
        at: ctx.now,
      });
      return { documentId, fileId: file.id };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}

/**
 * Sets a new profile photo (from prepareProfilePhotoUpload). The previous photo's file is
 * deleted, so its id stops working for everyone.
 */
export async function replaceProfilePhoto(
  ctx: AppContext,
  viewer: Viewer,
  upload: MechanicUpload,
): Promise<{ fileId: string }> {
  assertUploadFor(upload, "mechanic_profile_photo", "profilePhoto");
  const saved: SavedFile[] = [];
  let outcome: { fileId: string; previousKey: string | null };
  try {
    outcome = await writeTx(ctx.db, async (trx) => {
      await requireMechanicState(trx, viewer);
      const current = await trx
        .selectFrom("mechanic_profiles as p")
        .leftJoin("files as f", "f.id", "p.profile_photo_file_id")
        .select(["p.profile_photo_file_id", "f.storage_key", "f.owner_user_id"])
        .where("p.user_id", "=", viewer.id)
        .executeTakeFirstOrThrow();
      const file = await saveFile(trx, ctx, viewer.id, upload.prepared, "mechanic_profile_photo", upload.originalName);
      saved.push(file);
      await trx
        .updateTable("mechanic_profiles")
        .set({ profile_photo_file_id: file.id, updated_at: ctx.now.toISOString() })
        .where("user_id", "=", viewer.id)
        .execute();
      const removePrevious = current.profile_photo_file_id !== null && current.owner_user_id === viewer.id;
      if (removePrevious && current.profile_photo_file_id) {
        await trx.deleteFrom("files").where("id", "=", current.profile_photo_file_id).execute();
      }
      await recordAudit(trx, {
        actor: viewer,
        action: "mechanic.profile_photo_replace",
        entityType: "mechanic",
        entityId: viewer.id,
        metadata: { fileId: file.id, previousFileId: current.profile_photo_file_id },
        at: ctx.now,
      });
      return { fileId: file.id, previousKey: removePrevious ? current.storage_key : null };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
  // The old photo's row is gone; its bytes are removed once the change is committed.
  if (outcome.previousKey) await discardStoredFiles(ctx, [{ storageKey: outcome.previousKey }]);
  return { fileId: outcome.fileId };
}
