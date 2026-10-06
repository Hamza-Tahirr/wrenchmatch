import "server-only";

import {
  DOCUMENT_KIND_INFO,
  DOCUMENT_KINDS,
  DOCUMENT_STATUS_INFO,
  DOCUMENT_STATUSES,
  MECHANIC_SERVICE_MODE_INFO,
  MECHANIC_STATUS_INFO,
  type BadgeTone,
  type DocumentKind,
  type DocumentStatus,
  type MechanicServiceMode,
  type MechanicStatus,
} from "@/lib/domain";
import { todayInZone } from "@/lib/time";
import {
  formatAvailabilityWindow,
  minutesToTimeInput,
  WEEKDAYS,
  type GarageAddress,
  type MechanicAvailabilityFormValues,
  type MechanicProfileFormValues,
  type MechanicServicesFormValues,
} from "@/lib/validation/mechanic";
import type { AppContext, Viewer } from "@/server/context";

import { assertMechanic, loadMechanicState } from "./access";
import { applicationChecklist, type ApplicationChecklist } from "./checklist";
import { insuranceWarning, jobEligibility, type InsuranceWarning, type JobEligibility } from "./eligibility";
import { mapBase, type MechanicMapBase } from "./map";
import { payoutOnboardingStatus, type PayoutOnboardingStatus } from "./payouts";

// The signed-in mechanic's own profile, private fields included (owner-only view).

export type SafetyReviewState = "not_required" | "approved" | "pending_review";

export type MechanicServiceDto = {
  categoryId: string;
  name: string;
  safetySensitive: boolean;
  /** False when an admin has since disabled the category in the pilot. */
  categoryEnabled: boolean;
  safety: SafetyReviewState;
  /** "Approved for safety work" / "Pending admin safety review" / "" */
  safetyLabel: string;
};

export type AvailabilityWindowDto = {
  id: string;
  /** 0 = Sunday */
  weekday: number;
  weekdayLabel: string;
  startMinute: number;
  /** 1440 = midnight at the end of the day. */
  endMinute: number;
  /** "Mon 8:00 AM–6:00 PM" */
  label: string;
};

export type MechanicDocumentDto = {
  id: string;
  kind: DocumentKind;
  kindLabel: string;
  status: DocumentStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  expiresOn: string | null;
  /** The admin's note when reviewed (e.g. why it was rejected). */
  reviewNote: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
  /** Show or download with /api/files/<fileId> (owner and admins only). */
  fileId: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
};

export type MyMechanicProfile = {
  userId: string;
  status: MechanicStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  /** The admin's reason when rejected or suspended. */
  statusReason: string | null;
  statusChangedAt: string | null;
  approvedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Public profile
  displayName: string;
  bio: string | null;
  yearsExperience: number;
  certifications: string | null;
  serviceMode: MechanicServiceMode;
  serviceModeLabel: string;
  travelRadiusMiles: number;
  baseZip: string;
  baseArea: { city: string; state: string; label: string; timeZone: string };
  /** Base-ZIP centroid, travel radius and mode for the service-area map (approximate). */
  mapBase: MechanicMapBase;
  acceptingJobs: boolean;
  servicesAllMakes: boolean;
  makes: string[];
  services: MechanicServiceDto[];
  availability: AvailabilityWindowDto[];
  /** /api/files/<id>, or null. */
  profilePhotoFileId: string | null;
  documents: MechanicDocumentDto[];

  // Private (owner only)
  private: {
    legalName: string | null;
    businessName: string | null;
    phone: string | null;
    contactEmail: string | null;
    garageAddress: GarageAddress | null;
  };
  insurance: {
    provider: string | null;
    policyNumber: string | null;
    expiresOn: string | null;
    warning: InsuranceWarning | null;
  };

  payoutOnboarding: PayoutOnboardingStatus;
  checklist: ApplicationChecklist;
  eligibility: JobEligibility;
  /** True when rejected: the mechanic may update the profile and resubmit. */
  canResubmit: boolean;
  /** Current values for the edit forms (feed them to defaultValue). */
  formValues: {
    profile: MechanicProfileFormValues;
    services: MechanicServicesFormValues;
    availability: MechanicAvailabilityFormValues;
  };
};

function safetyState(safetySensitive: boolean, approved: boolean): { safety: SafetyReviewState; safetyLabel: string } {
  if (!safetySensitive) return { safety: "not_required", safetyLabel: "" };
  return approved
    ? { safety: "approved", safetyLabel: "Approved for safety work" }
    : { safety: "pending_review", safetyLabel: "Pending admin safety review" };
}

function narrowDocumentKind(value: string): DocumentKind {
  return DOCUMENT_KINDS.find((kind) => kind === value) ?? "other";
}

function narrowDocumentStatus(value: string): DocumentStatus {
  return DOCUMENT_STATUSES.find((status) => status === value) ?? "pending";
}

/** The viewer's own mechanic profile, or null when they have not applied yet. */
export async function getMyMechanicProfile(ctx: AppContext, viewer: Viewer): Promise<MyMechanicProfile | null> {
  assertMechanic(viewer);
  const state = await loadMechanicState(ctx.db, viewer.id);
  if (!state) return null;

  const row = await ctx.db
    .selectFrom("mechanic_profiles as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
    .leftJoin("mechanic_private as m", "m.user_id", "p.user_id")
    .select([
      "p.bio",
      "p.years_experience",
      "p.certifications",
      "p.services_all_makes",
      "p.profile_photo_file_id",
      "p.status_changed_at",
      "p.approved_at",
      "p.submitted_at",
      "p.created_at",
      "p.updated_at",
      "z.city",
      "z.state",
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

  const services = await ctx.db
    .selectFrom("mechanic_services as s")
    .innerJoin("service_categories as c", "c.id", "s.category_id")
    .select(["s.category_id", "s.safety_approved", "c.name", "c.safety_sensitive", "c.enabled"])
    .where("s.mechanic_id", "=", viewer.id)
    .orderBy("c.sort_order")
    .execute();
  const makes = await ctx.db
    .selectFrom("mechanic_makes")
    .select("make")
    .where("mechanic_id", "=", viewer.id)
    .orderBy("make")
    .execute();
  const windows = await ctx.db
    .selectFrom("mechanic_availability")
    .select(["id", "weekday", "start_minute", "end_minute"])
    .where("mechanic_id", "=", viewer.id)
    .orderBy("weekday")
    .orderBy("start_minute")
    .execute();
  const documents = await ctx.db
    .selectFrom("mechanic_documents as d")
    .innerJoin("files as f", "f.id", "d.file_id")
    .select([
      "d.id",
      "d.kind",
      "d.status",
      "d.expires_on",
      "d.review_note",
      "d.reviewed_at",
      "d.created_at",
      "d.file_id",
      "f.original_name",
      "f.mime_type",
      "f.size_bytes",
    ])
    .where("d.mechanic_id", "=", viewer.id)
    .orderBy("d.created_at", "desc")
    .execute();

  const todayLocal = todayInZone(ctx.now, state.timeZone);
  const garageAddress: GarageAddress | null =
    row.garage_address_line1 && row.garage_city && row.garage_state && row.garage_zip
      ? { line1: row.garage_address_line1, city: row.garage_city, state: row.garage_state, zip: row.garage_zip }
      : null;
  const statusInfo = MECHANIC_STATUS_INFO[state.status];
  const documentDtos = documents.map((document): MechanicDocumentDto => {
    const kind = narrowDocumentKind(document.kind);
    const status = narrowDocumentStatus(document.status);
    return {
      id: document.id,
      kind,
      kindLabel: DOCUMENT_KIND_INFO[kind].label,
      status,
      statusLabel: DOCUMENT_STATUS_INFO[status].label,
      statusTone: DOCUMENT_STATUS_INFO[status].tone,
      expiresOn: document.expires_on,
      reviewNote: document.review_note,
      reviewedAt: document.reviewed_at,
      uploadedAt: document.created_at,
      fileId: document.file_id,
      fileName: document.original_name,
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
    };
  });

  return {
    userId: state.id,
    status: state.status,
    statusLabel: statusInfo.label,
    statusTone: statusInfo.tone,
    statusReason: state.statusReason,
    statusChangedAt: row.status_changed_at,
    approvedAt: row.approved_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    displayName: state.displayName,
    bio: row.bio,
    yearsExperience: row.years_experience,
    certifications: row.certifications,
    serviceMode: state.serviceMode,
    serviceModeLabel: MECHANIC_SERVICE_MODE_INFO[state.serviceMode].label,
    travelRadiusMiles: state.travelRadiusMiles,
    baseZip: state.baseZip,
    baseArea: { city: row.city, state: row.state, label: `${row.city}, ${row.state}`, timeZone: state.timeZone },
    mapBase: mapBase(state),
    acceptingJobs: state.acceptingJobs,
    servicesAllMakes: row.services_all_makes === 1,
    makes: makes.map((entry) => entry.make),
    services: services.map((service) => ({
      categoryId: service.category_id,
      name: service.name,
      safetySensitive: service.safety_sensitive === 1,
      categoryEnabled: service.enabled === 1,
      ...safetyState(service.safety_sensitive === 1, service.safety_approved === 1),
    })),
    availability: windows.map((window) => ({
      id: window.id,
      weekday: window.weekday,
      weekdayLabel: WEEKDAYS[window.weekday]?.label ?? String(window.weekday),
      startMinute: window.start_minute,
      endMinute: window.end_minute,
      label: formatAvailabilityWindow({
        weekday: window.weekday,
        startMinute: window.start_minute,
        endMinute: window.end_minute,
      }),
    })),
    profilePhotoFileId: row.profile_photo_file_id,
    documents: documentDtos,

    private: {
      legalName: row.legal_name,
      businessName: row.business_name,
      phone: row.phone,
      contactEmail: row.contact_email,
      garageAddress,
    },
    insurance: {
      provider: state.insuranceProvider,
      policyNumber: row.insurance_policy_number,
      expiresOn: state.insuranceExpiresOn,
      warning: insuranceWarning(state, todayLocal),
    },

    payoutOnboarding: payoutOnboardingStatus(),
    checklist: applicationChecklist({
      baseZip: state.baseZip,
      insuranceProvider: state.insuranceProvider,
      insurancePolicyNumber: row.insurance_policy_number,
      insuranceExpiresOn: state.insuranceExpiresOn,
      todayLocal,
      documents: documentDtos,
      serviceCount: services.length,
      availabilityCount: windows.length,
    }),
    eligibility: jobEligibility(state, todayLocal),
    canResubmit: state.status === "rejected",
    formValues: {
      profile: {
        displayName: state.displayName,
        legalName: row.legal_name ?? "",
        businessName: row.business_name ?? "",
        phone: row.phone ?? "",
        contactEmail: row.contact_email ?? "",
        bio: row.bio ?? "",
        baseZip: state.baseZip,
        travelRadiusMiles: String(state.travelRadiusMiles),
        serviceMode: state.serviceMode,
        garageAddressLine1: row.garage_address_line1 ?? "",
        garageCity: row.garage_city ?? "",
        garageState: row.garage_state ?? "",
        garageZip: row.garage_zip ?? "",
        yearsExperience: String(row.years_experience),
        certifications: row.certifications ?? "",
        insuranceProvider: state.insuranceProvider ?? "",
        insurancePolicyNumber: row.insurance_policy_number ?? "",
        insuranceExpiresOn: state.insuranceExpiresOn ?? "",
      },
      services: {
        services: services.map((service) => service.category_id),
        allMakes: row.services_all_makes === 1,
        makes: makes.map((entry) => entry.make),
      },
      availability: {
        availability: windows.map((window) => ({
          weekday: String(window.weekday),
          start: minutesToTimeInput(window.start_minute),
          end: minutesToTimeInput(window.end_minute),
        })),
      },
    },
  };
}
