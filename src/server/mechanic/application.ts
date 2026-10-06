import "server-only";

import { buildConsentSnapshot, type DocumentKind } from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import {
  MECHANIC_TERMS,
  MECHANIC_TERMS_VERSION,
  mechanicApplicationCommandSchema,
  type MechanicApplicationCommand,
} from "@/lib/validation/mechanic";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { discardStoredFiles, saveFile, type SavedFile } from "@/server/storage/uploads";

import { assertMechanic, loadMechanicState } from "./access";
import { applicationChecklist, loadChecklistCounts } from "./checklist";
import {
  applicationReceivedMessage,
  applicationResubmittedMessage,
  applicationSubmittedMessage,
  type ApplicationMessageInput,
} from "./messages";
import {
  assertInsuranceInFuture,
  loadZip,
  notifyAdmins,
  parseCommand,
  replaceAvailability,
  replaceMakes,
  replaceServices,
  requireBaseZip,
  resolveCategories,
} from "./shared";
import { assertUploadFor, type ApplicationUploads, type MechanicUpload } from "./uploads";

// Mechanic applications: the first submission and a resubmission after a rejection. An
// application creates the profile in status "applied"; admins review it (admin module).

export type SubmitApplicationResult = {
  mechanicId: string;
  status: "applied";
  submittedAt: string;
  documentIds: string[];
  profilePhotoFileId: string | null;
  /** Safety-sensitive services waiting for an admin safety review. */
  safetyReviewCategoryIds: string[];
};

type PendingDocument = { kind: DocumentKind; upload: MechanicUpload; expiresOn: string | null };

/** Saves a prepared file and remembers it so the bytes can be discarded on rollback. */
async function storeFile(
  trx: Tx,
  ctx: AppContext,
  ownerId: string,
  upload: MechanicUpload,
  purpose: "mechanic_profile_photo" | "mechanic_document",
  saved: SavedFile[],
): Promise<SavedFile> {
  const file = await saveFile(trx, ctx, ownerId, upload.prepared, purpose, upload.originalName);
  saved.push(file);
  return file;
}

/**
 * Creates the signed-in mechanic's application: profile (status "applied"), private details,
 * makes, services (safety-sensitive ones start unapproved, "pending admin safety review"),
 * weekly availability, documents (pending review) and files. Notifies every admin and the
 * applicant, and records the acceptance of MECHANIC_TERMS in the audit log.
 *
 * `uploads` must come from prepareApplicationUploads (validated and sanitized). Throws
 * DomainError: "forbidden" (not a mechanic), "conflict" (already applied), "invalid_input"
 * (details.fieldErrors keyed by form field: baseZip, insuranceExpiresOn, services, ...).
 */
export async function submitApplication(
  ctx: AppContext,
  viewer: Viewer,
  input: MechanicApplicationCommand,
  uploads: ApplicationUploads,
): Promise<SubmitApplicationResult> {
  assertMechanic(viewer);
  const command = parseCommand(mechanicApplicationCommandSchema, input);
  assertUploadFor(uploads.idDocument, "mechanic_document", "idDocument");
  assertUploadFor(uploads.insuranceDocument, "mechanic_document", "insuranceDocument");
  for (const upload of uploads.certificationDocs ?? []) assertUploadFor(upload, "mechanic_document", "certificationDocs");
  if (uploads.profilePhoto) assertUploadFor(uploads.profilePhoto, "mechanic_profile_photo", "profilePhoto");

  const nowIso = ctx.now.toISOString();
  const saved: SavedFile[] = [];
  try {
    return await writeTx(ctx.db, async (trx) => {
      const existing = await trx
        .selectFrom("mechanic_profiles")
        .select("user_id")
        .where("user_id", "=", viewer.id)
        .executeTakeFirst();
      if (existing) {
        throw new DomainError("conflict", "You've already applied. Update your profile instead of applying again.");
      }
      const zip = await requireBaseZip(trx, command.baseZip);
      assertInsuranceInFuture(command.insuranceExpiresOn, todayInZone(ctx.now, zip.timeZone));
      const categories = await resolveCategories(trx, command.services);

      const photo = uploads.profilePhoto
        ? await storeFile(trx, ctx, viewer.id, uploads.profilePhoto, "mechanic_profile_photo", saved)
        : null;

      await trx
        .insertInto("mechanic_profiles")
        .values({
          user_id: viewer.id,
          display_name: command.displayName,
          bio: command.bio,
          years_experience: command.yearsExperience,
          certifications: command.certifications,
          service_mode: command.serviceMode,
          travel_radius_miles: command.travelRadiusMiles,
          base_zip: zip.zip,
          base_lat: zip.lat,
          base_lng: zip.lng,
          services_all_makes: command.allMakes ? 1 : 0,
          insurance_provider: command.insuranceProvider,
          insurance_expires_on: command.insuranceExpiresOn,
          accepting_jobs: 1,
          profile_photo_file_id: photo?.id ?? null,
          status: "applied",
          status_reason: null,
          status_changed_at: nowIso,
          status_changed_by: viewer.id,
          approved_at: null,
          submitted_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .execute();
      await trx
        .insertInto("mechanic_private")
        .values({
          user_id: viewer.id,
          legal_name: command.legalName,
          business_name: command.businessName,
          phone: command.phone,
          contact_email: command.contactEmail,
          garage_address_line1: command.garageAddress?.line1 ?? null,
          garage_city: command.garageAddress?.city ?? null,
          garage_state: command.garageAddress?.state ?? null,
          garage_zip: command.garageAddress?.zip ?? null,
          insurance_policy_number: command.insurancePolicyNumber,
          updated_at: nowIso,
        })
        .execute();
      await replaceMakes(trx, viewer.id, command.allMakes, command.makes);
      await replaceServices(
        trx,
        viewer.id,
        categories.map((category) => category.id),
      );
      await replaceAvailability(trx, viewer.id, command.windows);

      const pendingDocuments: PendingDocument[] = [
        { kind: "id_document", upload: uploads.idDocument, expiresOn: null },
        { kind: "insurance", upload: uploads.insuranceDocument, expiresOn: command.insuranceExpiresOn },
        ...(uploads.certificationDocs ?? []).map(
          (upload): PendingDocument => ({ kind: "certification", upload, expiresOn: null }),
        ),
      ];
      const documentIds: string[] = [];
      for (const document of pendingDocuments) {
        const file = await storeFile(trx, ctx, viewer.id, document.upload, "mechanic_document", saved);
        const documentId = newId();
        await trx
          .insertInto("mechanic_documents")
          .values({
            id: documentId,
            mechanic_id: viewer.id,
            file_id: file.id,
            kind: document.kind,
            status: "pending",
            expires_on: document.expiresOn,
            created_at: nowIso,
          })
          .execute();
        documentIds.push(documentId);
      }

      const safetyReview = categories.filter((category) => category.safetySensitive);
      const message: ApplicationMessageInput = {
        mechanicId: viewer.id,
        displayName: command.displayName,
        baseZip: zip.zip,
        baseArea: `${zip.city}, ${zip.state}`,
        serviceCount: categories.length,
        safetyReviewNames: safetyReview.map((category) => category.name),
      };
      await notifyAdmins(trx, applicationSubmittedMessage(message), ctx.now);
      await notify(trx, { userId: viewer.id, ...applicationReceivedMessage(command.displayName), at: ctx.now });
      await recordAudit(trx, {
        actor: viewer,
        action: "mechanic.apply",
        entityType: "mechanic",
        entityId: viewer.id,
        metadata: {
          terms: buildConsentSnapshot(MECHANIC_TERMS, nowIso),
          termsVersion: MECHANIC_TERMS_VERSION,
          serviceCategoryIds: categories.map((category) => category.id),
          safetyReviewCategoryIds: safetyReview.map((category) => category.id),
          documentIds,
          serviceMode: command.serviceMode,
          baseZip: zip.zip,
        },
        at: ctx.now,
      });

      return {
        mechanicId: viewer.id,
        status: "applied",
        submittedAt: nowIso,
        documentIds,
        profilePhotoFileId: photo?.id ?? null,
        safetyReviewCategoryIds: safetyReview.map((category) => category.id),
      };
    });
  } catch (error) {
    await discardStoredFiles(ctx, saved);
    throw error;
  }
}

export type ResubmitApplicationResult = { mechanicId: string; status: "applied"; submittedAt: string };

/**
 * Sends a rejected application back for review (rejected -> applied) after the mechanic has
 * updated their profile. The checklist must be complete. Notifies every admin.
 * Throws DomainError "conflict" unless the application is rejected, "invalid_input" when
 * the checklist is incomplete (details.missing lists the checklist keys).
 */
export async function resubmitApplication(ctx: AppContext, viewer: Viewer): Promise<ResubmitApplicationResult> {
  assertMechanic(viewer);
  const nowIso = ctx.now.toISOString();
  return writeTx(ctx.db, async (trx) => {
    const state = await loadMechanicState(trx, viewer.id);
    if (!state) throw new DomainError("conflict", "Complete your mechanic application first.");
    if (state.status !== "rejected") {
      throw new DomainError(
        "conflict",
        state.status === "applied" || state.status === "under_review"
          ? "Your application is already waiting for review."
          : "Only a rejected application can be resubmitted.",
      );
    }
    const todayLocal = todayInZone(ctx.now, state.timeZone);
    const counts = await loadChecklistCounts(trx, viewer.id);
    const checklist = applicationChecklist({
      baseZip: state.baseZip,
      insuranceProvider: state.insuranceProvider,
      insuranceExpiresOn: state.insuranceExpiresOn,
      todayLocal,
      ...counts,
    });
    if (!checklist.complete) {
      const missing = checklist.items.filter((item) => !item.done);
      throw new DomainError(
        "invalid_input",
        `Finish your application before resubmitting. Still needed: ${missing.map((item) => item.label).join(", ")}.`,
        { missing: missing.map((item) => item.key) },
      );
    }

    await trx
      .updateTable("mechanic_profiles")
      .set({
        status: "applied",
        status_reason: null,
        status_changed_at: nowIso,
        status_changed_by: viewer.id,
        submitted_at: nowIso,
        updated_at: nowIso,
      })
      .where("user_id", "=", viewer.id)
      .where("status", "=", "rejected")
      .execute();

    const zip = await loadZip(trx, state.baseZip);
    const services = await trx
      .selectFrom("mechanic_services as s")
      .innerJoin("service_categories as c", "c.id", "s.category_id")
      .select(["c.name", "c.safety_sensitive", "s.safety_approved"])
      .where("s.mechanic_id", "=", viewer.id)
      .execute();
    await notifyAdmins(
      trx,
      applicationResubmittedMessage({
        mechanicId: viewer.id,
        displayName: state.displayName,
        baseZip: state.baseZip,
        baseArea: zip ? `${zip.city}, ${zip.state}` : state.baseZip,
        serviceCount: services.length,
        safetyReviewNames: services
          .filter((service) => service.safety_sensitive === 1 && service.safety_approved !== 1)
          .map((service) => service.name),
      }),
      ctx.now,
    );
    await recordAudit(trx, {
      actor: viewer,
      action: "mechanic.resubmit",
      entityType: "mechanic",
      entityId: viewer.id,
      metadata: { previousStatus: "rejected", previousReason: state.statusReason },
      at: ctx.now,
    });
    return { mechanicId: viewer.id, status: "applied", submittedAt: nowIso };
  });
}
