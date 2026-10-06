// Mechanic application and profile commands (src/server/mechanic/application.ts,
// profile-commands.ts, profile.ts, uploads.ts): validation, what gets stored, files,
// notifications, audit, conflicts, safety review state and resubmission.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  acceptingJobsFromFormData,
  MECHANIC_TERMS,
  MECHANIC_TERMS_VERSION,
  mechanicApplicationValuesFromFormData,
  mechanicDocumentValuesFromFormData,
  parseMechanicApplicationForm,
  parseMechanicAvailabilityForm,
  parseMechanicDocumentForm,
  parseMechanicProfileForm,
  parseMechanicServicesForm,
  type MechanicApplicationCommand,
  type MechanicApplicationFormValues,
  type MechanicProfileCommand,
} from "@/lib/validation/mechanic";
import type { UploadPurpose } from "@/server/config";
import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";
import { resubmitApplication, submitApplication } from "@/server/mechanic/application";
import { getMechanicFormOptions } from "@/server/mechanic/form-options";
import { getMyMechanicProfile } from "@/server/mechanic/profile";
import {
  addDocument,
  replaceProfilePhoto,
  setAcceptingJobs,
  setAvailability,
  updateProfile,
  updateServicesAndMakes,
} from "@/server/mechanic/profile-commands";
import {
  prepareApplicationUploads,
  prepareDocumentUpload,
  type ApplicationUploads,
  type MechanicUpload,
} from "@/server/mechanic/uploads";
import { prepareUpload } from "@/server/storage/uploads";
import { createTestContext, withNow, type TestContext } from "../support/db";
import { createMechanic, createUser, createZip, TEST_ZIPS } from "../support/factories";

// ctx.now is Monday 5 Oct 2026, 10:00 in Phoenix (America/Phoenix, UTC-7).

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

function jpeg(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } })
    .jpeg()
    .toBuffer();
}

/** A browser-style File, as FormData delivers uploads to a Server Action. */
function fileOf(bytes: Buffer | string, name: string, type: string): File {
  return new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });
}

async function upload(bytes: Buffer, name: string, purpose: UploadPurpose): Promise<MechanicUpload> {
  return { prepared: await prepareUpload({ bytes, name, size: bytes.byteLength }, purpose), originalName: name };
}

async function applicationUploads(): Promise<ApplicationUploads> {
  return {
    profilePhoto: await upload(await jpeg(), "me.jpg", "mechanic_profile_photo"),
    idDocument: await upload(PDF, "license.pdf", "mechanic_document"),
    insuranceDocument: await upload(await jpeg(800, 600), "insurance.jpg", "mechanic_document"),
    certificationDocs: [await upload(PDF, "ase.pdf", "mechanic_document")],
  };
}

function applicationValues(overrides: Partial<MechanicApplicationFormValues> = {}): MechanicApplicationFormValues {
  return {
    displayName: "Marco R.",
    legalName: "Marco Rossi",
    businessName: "Rossi Mobile Repair",
    phone: "(602) 555-0142",
    contactEmail: "Marco.Rossi@Example.com",
    bio: "Twelve years fixing cars around Phoenix.",
    baseZip: "85004",
    travelRadiusMiles: "25",
    serviceMode: "both",
    garageAddressLine1: "100 W Main St",
    garageCity: "Phoenix",
    garageState: "az",
    garageZip: "85004",
    yearsExperience: "12",
    certifications: "ASE A1-A8",
    insuranceProvider: "Desert Mutual",
    insurancePolicyNumber: "DM-123456",
    insuranceExpiresOn: "2027-06-30",
    services: ["battery_replacement", "oil_change", "brake_work"],
    allMakes: false,
    makes: ["Toyota", "Honda"],
    availability: [
      { weekday: "1", start: "08:00", end: "12:00" },
      { weekday: "1", start: "13:00", end: "17:00" },
      { weekday: "3", start: "09:00", end: "00:00" },
    ],
    acceptTerms: true,
    ...overrides,
  };
}

function command(overrides: Partial<MechanicApplicationFormValues> = {}): MechanicApplicationCommand {
  const result = parseMechanicApplicationForm(applicationValues(overrides));
  if (!result.ok) throw new Error(`invalid test application: ${JSON.stringify(result.fieldErrors)}`);
  return result.data;
}

function profileCommand(mechanicEmail: string, overrides: Partial<MechanicProfileCommand> = {}): MechanicProfileCommand {
  return {
    displayName: "Priya S.",
    legalName: "Priya Shah",
    businessName: null,
    phone: "480-555-0100",
    contactEmail: mechanicEmail,
    bio: null,
    baseZip: "85004",
    travelRadiusMiles: 20,
    serviceMode: "both",
    garageAddress: { line1: "1 Garage Way", city: "Phoenix", state: "AZ", zip: "85004" },
    yearsExperience: 7,
    certifications: null,
    insuranceProvider: "Desert Mutual",
    insurancePolicyNumber: "DM-555",
    insuranceExpiresOn: "2027-01-31",
    ...overrides,
  };
}

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]): Promise<DomainError> {
  const error = await promise.then(
    () => {
      throw new Error(`expected DomainError ${code}`);
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

function fieldErrorsOf(error: DomainError): Record<string, string[]> {
  return (error.details?.fieldErrors ?? {}) as Record<string, string[]>;
}

let t: TestContext;
let applicant: Viewer;
let admins: Viewer[];

function rows<T>(query: string, ...params: unknown[]): T[] {
  return t.sqlite.prepare(query).all(...params) as T[];
}

beforeEach(async () => {
  t = createTestContext();
  for (const zip of ["85004", "85281"] as const) await createZip(t.ctx, { zip, ...TEST_ZIPS[zip] });
  applicant = await createUser(t.ctx, { role: "mechanic", displayName: "Marco Rossi" });
  admins = [await createUser(t.ctx, { role: "admin" }), await createUser(t.ctx, { role: "admin" })];
  const disabledAdmin = await createUser(t.ctx, { role: "admin" });
  t.sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), disabledAdmin.id);
});

afterEach(async () => {
  await t.cleanup();
});

describe("submitApplication", () => {
  it("stores the application, its files and private details, and notifies admins", async () => {
    expect(await getMyMechanicProfile(t.ctx, applicant)).toBeNull();
    const result = await submitApplication(t.ctx, applicant, command(), await applicationUploads());
    const nowIso = t.ctx.now.toISOString();

    expect(result).toMatchObject({ mechanicId: applicant.id, status: "applied", submittedAt: nowIso });
    expect(result.safetyReviewCategoryIds).toEqual(["brake_work"]);

    const [profile] = rows<Record<string, unknown>>("SELECT * FROM mechanic_profiles WHERE user_id = ?", applicant.id);
    expect(profile).toMatchObject({
      display_name: "Marco R.",
      status: "applied",
      submitted_at: nowIso,
      service_mode: "both",
      travel_radius_miles: 25,
      base_zip: "85004",
      base_lat: TEST_ZIPS["85004"].lat,
      base_lng: TEST_ZIPS["85004"].lng,
      services_all_makes: 0,
      insurance_provider: "Desert Mutual",
      insurance_expires_on: "2027-06-30",
      accepting_jobs: 1,
      profile_photo_file_id: result.profilePhotoFileId,
      years_experience: 12,
    });
    const [privateRow] = rows<Record<string, unknown>>("SELECT * FROM mechanic_private WHERE user_id = ?", applicant.id);
    expect(privateRow).toMatchObject({
      legal_name: "Marco Rossi",
      business_name: "Rossi Mobile Repair",
      phone: "(602) 555-0142",
      contact_email: "marco.rossi@example.com",
      garage_address_line1: "100 W Main St",
      garage_city: "Phoenix",
      garage_state: "AZ",
      garage_zip: "85004",
      insurance_policy_number: "DM-123456",
    });
    expect(rows("SELECT make FROM mechanic_makes WHERE mechanic_id = ? ORDER BY make", applicant.id)).toEqual([
      { make: "Honda" },
      { make: "Toyota" },
    ]);
    expect(
      rows("SELECT category_id, safety_approved FROM mechanic_services WHERE mechanic_id = ? ORDER BY category_id", applicant.id),
    ).toEqual([
      { category_id: "battery_replacement", safety_approved: 0 },
      { category_id: "brake_work", safety_approved: 0 },
      { category_id: "oil_change", safety_approved: 0 },
    ]);
    expect(
      rows(
        "SELECT weekday, start_minute, end_minute FROM mechanic_availability WHERE mechanic_id = ? ORDER BY weekday, start_minute",
        applicant.id,
      ),
    ).toEqual([
      { weekday: 1, start_minute: 480, end_minute: 720 },
      { weekday: 1, start_minute: 780, end_minute: 1020 },
      { weekday: 3, start_minute: 540, end_minute: 1440 },
    ]);

    const documents = rows<{ id: string; kind: string; status: string; expires_on: string | null; file_id: string }>(
      "SELECT id, kind, status, expires_on, file_id FROM mechanic_documents WHERE mechanic_id = ? ORDER BY kind",
      applicant.id,
    );
    expect(documents.map(({ kind, status, expires_on }) => ({ kind, status, expires_on }))).toEqual([
      { kind: "certification", status: "pending", expires_on: null },
      { kind: "id_document", status: "pending", expires_on: null },
      { kind: "insurance", status: "pending", expires_on: "2027-06-30" },
    ]);
    expect(result.documentIds.sort()).toEqual(documents.map((document) => document.id).sort());

    const files = rows<{ id: string; purpose: string; mime_type: string; metadata_stripped: number; storage_key: string; owner_user_id: string }>(
      "SELECT id, purpose, mime_type, metadata_stripped, storage_key, owner_user_id FROM files ORDER BY purpose, mime_type",
    );
    expect(files).toHaveLength(4);
    expect(files.every((file) => file.owner_user_id === applicant.id)).toBe(true);
    expect(files.map(({ purpose, mime_type, metadata_stripped }) => [purpose, mime_type, metadata_stripped])).toEqual([
      ["mechanic_document", "application/pdf", 0],
      ["mechanic_document", "application/pdf", 0],
      ["mechanic_document", "image/jpeg", 1],
      ["mechanic_profile_photo", "image/jpeg", 1],
    ]);
    for (const file of files) expect((await t.ctx.storage.read(file.storage_key)).byteLength).toBeGreaterThan(0);

    const adminNotes = rows<{ user_id: string; type: string; title: string; body: string; link_path: string }>(
      "SELECT user_id, type, title, body, link_path FROM notifications WHERE type = 'mechanic.application_submitted' ORDER BY user_id",
    );
    expect(adminNotes.map((note) => note.user_id)).toEqual(admins.map((admin) => admin.id).sort());
    for (const note of adminNotes) {
      expect(note.link_path).toBe(`/admin/mechanics/${applicant.id}`);
      expect(note.title).toBe("New mechanic application: Marco R.");
      expect(note.body).toContain("Safety review needed for: Brake work");
      expect(note.body).not.toContain("555-0142");
      expect(note.body).not.toContain("marco.rossi@example.com");
    }
    expect(rows("SELECT to_user_id FROM email_outbox WHERE template = 'mechanic_application_submitted' ORDER BY to_user_id")).toEqual(
      admins.map((admin) => ({ to_user_id: admin.id })).sort((a, b) => (a.to_user_id < b.to_user_id ? -1 : 1)),
    );
    expect(rows("SELECT type FROM notifications WHERE user_id = ?", applicant.id)).toEqual([
      { type: "mechanic.application_received" },
    ]);

    const [audit] = rows<{ action: string; actor_user_id: string; metadata_json: string }>(
      "SELECT action, actor_user_id, metadata_json FROM audit_events WHERE entity_id = ?",
      applicant.id,
    );
    expect(audit.action).toBe("mechanic.apply");
    expect(audit.actor_user_id).toBe(applicant.id);
    const metadata = JSON.parse(audit.metadata_json) as { terms: { version: string; acceptedAt: string; items: { key: string; text: string }[] }; termsVersion: string };
    expect(metadata.termsVersion).toBe(MECHANIC_TERMS_VERSION);
    expect(metadata.terms.acceptedAt).toBe(nowIso);
    expect(metadata.terms.items).toEqual(MECHANIC_TERMS.map((item) => ({ key: item.key, text: item.text })));
    expect(metadata.terms.items.find((item) => item.key === "quote_commitment")?.text).toMatch(/time slot until the quote expires/);
    expect(metadata.terms.items.find((item) => item.key === "independent_contractor")?.text).toMatch(/independent contractor/);
  });

  it("shows the owner their full profile, checklist and status", async () => {
    const result = await submitApplication(t.ctx, applicant, command(), await applicationUploads());
    const profile = await getMyMechanicProfile(t.ctx, applicant);
    if (!profile) throw new Error("expected a profile");

    expect(profile).toMatchObject({
      userId: applicant.id,
      status: "applied",
      statusLabel: "Applied",
      displayName: "Marco R.",
      serviceMode: "both",
      baseZip: "85004",
      baseArea: { city: "Phoenix", state: "AZ", label: "Phoenix, AZ", timeZone: "America/Phoenix" },
      // The service-area map: base-ZIP centroid and radius only (never the garage address).
      mapBase: {
        zip: "85004",
        areaLabel: "Phoenix, AZ 85004",
        point: { lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng },
        serviceMode: "both",
      },
      acceptingJobs: true,
      servicesAllMakes: false,
      makes: ["Honda", "Toyota"],
      profilePhotoFileId: result.profilePhotoFileId,
      private: {
        legalName: "Marco Rossi",
        phone: "(602) 555-0142",
        contactEmail: "marco.rossi@example.com",
        garageAddress: { line1: "100 W Main St", city: "Phoenix", state: "AZ", zip: "85004" },
      },
      insurance: { provider: "Desert Mutual", policyNumber: "DM-123456", expiresOn: "2027-06-30", warning: null },
      payoutOnboarding: { connected: false, label: "Online payments coming soon" },
      eligibility: { canReceiveJobs: false, reason: "pending_review" },
      canResubmit: false,
    });
    expect(profile.services.find((service) => service.categoryId === "brake_work")).toMatchObject({
      safetySensitive: true,
      safety: "pending_review",
      safetyLabel: "Pending admin safety review",
    });
    expect(profile.services.find((service) => service.categoryId === "oil_change")?.safety).toBe("not_required");
    expect(profile.availability.map((window) => window.label)).toEqual([
      "Mon 8:00 AM–12:00 PM",
      "Mon 1:00 PM–5:00 PM",
      "Wed 9:00 AM–12:00 AM",
    ]);
    expect(profile.documents.map((document) => [document.kind, document.status]).sort()).toEqual([
      ["certification", "pending"],
      ["id_document", "pending"],
      ["insurance", "pending"],
    ]);
    expect(profile.checklist.complete).toBe(true);
    expect(profile.formValues.profile).toMatchObject({ garageState: "AZ", travelRadiusMiles: "25", insuranceExpiresOn: "2027-06-30" });
    expect(profile.formValues.availability.availability[2]).toEqual({ weekday: "3", start: "09:00", end: "00:00" });
    expect(profile.formValues.services).toEqual({
      services: ["battery_replacement", "oil_change", "brake_work"],
      allMakes: false,
      makes: ["Honda", "Toyota"],
    });
  });

  it("refuses a second application with a conflict", async () => {
    await submitApplication(t.ctx, applicant, command(), await applicationUploads());
    const filesBefore = rows("SELECT id FROM files").length;
    const error = await expectDomainError(
      submitApplication(t.ctx, applicant, command({ displayName: "Marco Again" }), await applicationUploads()),
      "conflict",
    );
    expect(error.userMessage).toMatch(/already applied/);
    expect(rows("SELECT id FROM files")).toHaveLength(filesBefore);
    expect(rows("SELECT display_name FROM mechanic_profiles")).toEqual([{ display_name: "Marco R." }]);
  });

  it("checks the base ZIP, insurance expiry and categories against the database", async () => {
    let error = await expectDomainError(
      submitApplication(t.ctx, applicant, command({ baseZip: "99999" }), await applicationUploads()),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).baseZip[0]).toMatch(/location data for ZIP 99999/);

    for (const expiresOn of ["2026-10-04", "2026-10-05"]) {
      error = await expectDomainError(
        submitApplication(t.ctx, applicant, command({ insuranceExpiresOn: expiresOn }), await applicationUploads()),
        "invalid_input",
      );
      expect(fieldErrorsOf(error).insuranceExpiresOn[0]).toMatch(/after today/);
    }

    error = await expectDomainError(
      submitApplication(t.ctx, applicant, command({ services: ["oil_change", "teleportation"] }), await applicationUploads()),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).services).toHaveLength(1);

    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'oil_change'").run();
    error = await expectDomainError(
      submitApplication(t.ctx, applicant, command(), await applicationUploads()),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).services[0]).toMatch(/Oil change isn't offered/);

    // Nothing was stored by the failed attempts.
    expect(rows("SELECT user_id FROM mechanic_profiles")).toEqual([]);
    expect(rows("SELECT id FROM files")).toEqual([]);
  });

  it("accepts a base ZIP outside the pilot area when it has a centroid", async () => {
    await createZip(t.ctx, { zip: "10001", ...TEST_ZIPS["10001"] });
    await submitApplication(t.ctx, applicant, command({ baseZip: "10001" }), await applicationUploads());
    expect(rows("SELECT base_zip, base_lat FROM mechanic_profiles")).toEqual([
      { base_zip: "10001", base_lat: TEST_ZIPS["10001"].lat },
    ]);
  });

  it("re-validates the typed command, the uploads and the role", async () => {
    let error = await expectDomainError(
      submitApplication(t.ctx, applicant, { ...command(), travelRadiusMiles: 0 }, await applicationUploads()),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).travelRadiusMiles).toBeDefined();

    const uploads = await applicationUploads();
    error = await expectDomainError(
      submitApplication(t.ctx, applicant, command(), { ...uploads, profilePhoto: await upload(PDF, "me.pdf", "mechanic_document") }),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).profilePhoto).toHaveLength(1);

    const customer = await createUser(t.ctx, { role: "customer" });
    await expectDomainError(submitApplication(t.ctx, customer, command(), await applicationUploads()), "forbidden");
    await expectDomainError(getMyMechanicProfile(t.ctx, customer), "forbidden");
  });
});

describe("application form validation", () => {
  function errors(values: MechanicApplicationFormValues): Record<string, string[]> {
    const result = parseMechanicApplicationForm(values);
    if (result.ok) throw new Error("expected errors");
    return result.fieldErrors;
  }

  it("reports every missing field at once, keyed by input name", () => {
    const empty = applicationValues({
      displayName: "",
      legalName: "",
      businessName: "",
      phone: "",
      contactEmail: "",
      bio: "",
      baseZip: "",
      travelRadiusMiles: "",
      serviceMode: "",
      yearsExperience: "",
      certifications: "",
      insuranceProvider: "",
      insurancePolicyNumber: "",
      insuranceExpiresOn: "",
      services: [],
      makes: [],
      availability: [],
      acceptTerms: false,
    });
    expect(Object.keys(errors(empty)).sort()).toEqual(
      [
        "acceptTerms",
        "availability",
        "baseZip",
        "contactEmail",
        "displayName",
        "insuranceExpiresOn",
        "insurancePolicyNumber",
        "insuranceProvider",
        "legalName",
        "makes",
        "phone",
        "serviceMode",
        "services",
        "travelRadiusMiles",
        "yearsExperience",
      ].sort(),
    );
  });

  it("requires a garage address only for garage service", () => {
    const garageless = { garageAddressLine1: "", garageCity: "", garageState: "", garageZip: "" };
    expect(Object.keys(errors(applicationValues({ serviceMode: "garage", ...garageless }))).sort()).toEqual([
      "garageAddressLine1",
      "garageCity",
      "garageState",
      "garageZip",
    ]);
    expect(command({ serviceMode: "mobile", ...garageless }).garageAddress).toBeNull();
    expect(command({ serviceMode: "mobile" }).garageAddress).toBeNull();
  });

  it("checks availability windows: end after start, no overlaps on a day, touching is fine", () => {
    const overlap = errors(
      applicationValues({
        availability: [
          { weekday: "1", start: "08:00", end: "12:00" },
          { weekday: "1", start: "11:00", end: "14:00" },
          { weekday: "2", start: "11:00", end: "14:00" },
        ],
      }),
    );
    expect(Object.keys(overlap)).toEqual(["availability.1.start"]);
    expect(overlap["availability.1.start"][0]).toMatch(/overlaps another Monday window \(8:00 AM–12:00 PM\)/);

    expect(Object.keys(errors(applicationValues({ availability: [{ weekday: "1", start: "14:00", end: "13:00" }] })))).toEqual([
      "availability.0.end",
    ]);
    expect(
      Object.keys(errors(applicationValues({ availability: [{ weekday: "9", start: "8:00", end: "nine" }] }))).sort(),
    ).toEqual(["availability.0.end", "availability.0.weekday"]);

    const touching = parseMechanicAvailabilityForm({
      availability: [
        { weekday: "1", start: "08:00", end: "12:00" },
        { weekday: "", start: "", end: "" },
        { weekday: "1", start: "12:00", end: "17:00" },
      ],
    });
    expect(touching).toEqual({
      ok: true,
      data: {
        windows: [
          { weekday: 1, startMinute: 480, endMinute: 720 },
          { weekday: 1, startMinute: 720, endMinute: 1020 },
        ],
      },
    });
  });

  it.each([
    ["phone", "555"],
    ["contactEmail", "not-an-email"],
    ["travelRadiusMiles", "0"],
    ["travelRadiusMiles", "101"],
    ["yearsExperience", "61"],
    ["baseZip", "8500"],
    ["displayName", "x".repeat(61)],
    ["insuranceExpiresOn", "2027-02-30"],
  ] as const)("rejects %s = %j", (field, value) => {
    expect(errors(applicationValues({ [field]: value } as Partial<MechanicApplicationFormValues>))[field]).toHaveLength(1);
  });

  it("checks makes against the list unless all makes are serviced", () => {
    expect(errors(applicationValues({ makes: ["Toyota", "DeLorean"] })).makes[0]).toMatch(/DeLorean/);
    expect(command({ allMakes: true, makes: ["DeLorean"] })).toMatchObject({ allMakes: true, makes: [] });
  });
});

describe("getMechanicFormOptions", () => {
  it("lists enabled categories with safety notes, the terms and the upload limits", async () => {
    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'wipers'").run();
    const options = await getMechanicFormOptions(t.ctx);
    expect(options.categories).toHaveLength(11);
    expect(options.categories.map((category) => category.id)).not.toContain("wipers");
    expect(options.categories.find((category) => category.id === "brake_work")).toMatchObject({
      safetySensitive: true,
      safetyNote: expect.stringMatching(/admin reviews and approves you/),
    });
    expect(options.categories.find((category) => category.id === "oil_change")?.safetyNote).toBeNull();
    expect(options.terms).toEqual({ version: MECHANIC_TERMS_VERSION, items: MECHANIC_TERMS });
    expect(options.uploads).toEqual({
      profilePhoto: { accept: "image/jpeg,image/png,image/webp", acceptLabel: "JPEG, PNG or WebP", maxBytes: 5 * 1024 * 1024, limitLabel: "Up to 5 MB" },
      document: {
        accept: "image/jpeg,image/png,image/webp,application/pdf",
        acceptLabel: "PDF, JPEG, PNG or WebP",
        maxBytes: 10 * 1024 * 1024,
        limitLabel: "Up to 10 MB",
      },
      certificationDocsMax: 3,
      certificationDocsLimitLabel: "Up to 3 files, 10 MB each",
    });
    expect(options.serviceModes.map((mode) => mode.value)).toEqual(["mobile", "garage", "both"]);
    expect(options.documentKinds.map((kind) => kind.value)).toEqual(["id_document", "insurance", "certification", "other"]);
    // Enabled pilot ZIPs are offered as base-ZIP suggestions; a disabled one is not.
    t.sqlite.prepare("UPDATE pilot_zips SET enabled = 0 WHERE zip = '85004'").run();
    const suggestions = (await getMechanicFormOptions(t.ctx)).zipSuggestions;
    expect(suggestions).toContainEqual({ zip: "85281", label: `${TEST_ZIPS["85281"].city}, ${TEST_ZIPS["85281"].state}` });
    expect(suggestions.map((suggestion) => suggestion.zip)).not.toContain("85004");
    // Every ZIP with a centroid (pilot or not) can be a base ZIP, so the live map knows them all.
    const centroids = (await getMechanicFormOptions(t.ctx)).zipCentroids;
    expect(centroids).toContainEqual({ zip: "85004", label: "Phoenix, AZ 85004", lat: TEST_ZIPS["85004"].lat, lng: TEST_ZIPS["85004"].lng });
    expect(centroids.map((centroid) => centroid.zip)).toEqual([...centroids.map((centroid) => centroid.zip)].sort());
  });
});

describe("reading the mechanic forms from FormData", () => {
  it("reads text fields, checkboxes, checkbox groups and indexed availability rows", () => {
    const formData = new FormData();
    const { services, makes, availability, allMakes, acceptTerms, ...text } = applicationValues({ bio: "" });
    for (const [key, value] of Object.entries(text)) formData.set(key, value);
    formData.delete("bio");
    for (const service of services) formData.append("services", service);
    for (const make of makes) formData.append("makes", make);
    availability.forEach((row, index) => {
      formData.set(`availability.${index}.weekday`, row.weekday);
      formData.set(`availability.${index}.start`, row.start);
      formData.set(`availability.${index}.end`, row.end);
    });
    formData.set("acceptTerms", "on");
    expect([allMakes, acceptTerms]).toEqual([false, true]);

    const values = mechanicApplicationValuesFromFormData(formData);
    expect(values).toEqual(applicationValues({ bio: "" }));
    expect(parseMechanicApplicationForm(values).ok).toBe(true);
  });

  it("parses the profile, services, document and accepting-jobs forms", () => {
    const { services, makes, availability, allMakes, acceptTerms, ...profileValues } = applicationValues();
    void availability;
    void acceptTerms;
    const profile = parseMechanicProfileForm(profileValues);
    expect(profile.ok && profile.data).toMatchObject({ displayName: "Marco R.", travelRadiusMiles: 25, garageAddress: { state: "AZ" } });
    expect(parseMechanicServicesForm({ services, allMakes, makes })).toEqual({
      ok: true,
      data: { services, allMakes: false, makes: ["Toyota", "Honda"] },
    });
    expect(parseMechanicServicesForm({ services: [], allMakes: true, makes: [] })).toEqual({
      ok: false,
      fieldErrors: { services: ["Choose at least one service you offer."] },
    });

    const documentForm = new FormData();
    documentForm.set("kind", "insurance");
    documentForm.set("expiresOn", "2027-10-31");
    expect(parseMechanicDocumentForm(mechanicDocumentValuesFromFormData(documentForm))).toEqual({
      ok: true,
      data: { kind: "insurance", expiresOn: "2027-10-31" },
    });
    expect(parseMechanicDocumentForm({ kind: "passport", expiresOn: "soon" })).toEqual({
      ok: false,
      fieldErrors: {
        kind: ["Choose what kind of document this is."],
        expiresOn: ["Enter a valid expiry date, or leave it empty."],
      },
    });
    expect(parseMechanicDocumentForm({ kind: "other", expiresOn: "" })).toEqual({ ok: true, data: { kind: "other", expiresOn: null } });

    const toggle = new FormData();
    expect(acceptingJobsFromFormData(toggle)).toEqual({ acceptingJobs: false });
    toggle.set("acceptingJobs", "true");
    expect(acceptingJobsFromFormData(toggle)).toEqual({ acceptingJobs: true });
  });
});

describe("prepareApplicationUploads", () => {
  it("reports missing and unusable files by field, and prepares good ones", async () => {
    const missing = await prepareApplicationUploads(new FormData());
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(Object.keys(missing.fieldErrors).sort()).toEqual(["idDocument", "insuranceDocument"]);

    const formData = new FormData();
    formData.set("idDocument", fileOf(PDF, "license.pdf", "application/pdf"));
    formData.set("insuranceDocument", fileOf("just text", "insurance.txt", "text/plain"));
    formData.set("profilePhoto", fileOf(await jpeg(), "me.jpg", "image/jpeg"));
    const bad = await prepareApplicationUploads(formData);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors)).toEqual(["insuranceDocument"]);
      expect(bad.fieldErrors.insuranceDocument[0]).toMatch(/PDF, JPEG, PNG or WebP/);
    }

    formData.set("insuranceDocument", fileOf(await jpeg(300, 200), "insurance.jpg", "image/jpeg"));
    const good = await prepareApplicationUploads(formData);
    if (!good.ok) throw new Error(JSON.stringify(good.fieldErrors));
    expect(good.value.idDocument.prepared.mimeType).toBe("application/pdf");
    expect(good.value.insuranceDocument.prepared).toMatchObject({ mimeType: "image/jpeg", metadataStripped: true });
    expect(good.value.profilePhoto?.prepared.mimeType).toBe("image/jpeg");
    expect(good.value.certificationDocs).toEqual([]);
  });
});

describe("profile commands", () => {
  it("updateProfile saves the details, moves the base point with the ZIP and audits field names only", async () => {
    // Before admin review an applicant may still correct their insurance details here.
    const mechanic = await createMechanic(t.ctx, { displayName: "Priya S.", status: "applied" });
    const result = await updateProfile(
      t.ctx,
      mechanic,
      profileCommand(mechanic.email, { baseZip: "85281", serviceMode: "mobile", garageAddress: null, phone: "480-555-0199" }),
    );
    expect(result.changedFields).toEqual(
      expect.arrayContaining(["baseZip", "serviceMode", "phone", "garageAddress", "insuranceExpiresOn", "travelRadiusMiles"]),
    );
    expect(rows("SELECT base_zip, base_lat, base_lng, service_mode, travel_radius_miles FROM mechanic_profiles")).toEqual([
      { base_zip: "85281", base_lat: TEST_ZIPS["85281"].lat, base_lng: TEST_ZIPS["85281"].lng, service_mode: "mobile", travel_radius_miles: 20 },
    ]);
    expect(rows("SELECT phone, garage_address_line1, insurance_policy_number FROM mechanic_private")).toEqual([
      { phone: "480-555-0199", garage_address_line1: null, insurance_policy_number: "DM-555" },
    ]);
    const [audit] = rows<{ action: string; metadata_json: string }>(
      "SELECT action, metadata_json FROM audit_events WHERE action = 'mechanic.profile_update'",
    );
    expect(audit.metadata_json).not.toContain("480-555-0199");
  });

  it("approved mechanics can't change their insurance from the profile form; other edits still save", async () => {
    // Expired cover on record (test now is 2026-10-05).
    const mechanic = await createMechanic(t.ctx, {
      insuranceProvider: "Desert Mutual",
      insuranceExpiresOn: "2026-09-01",
    });
    t.sqlite.prepare("UPDATE mechanic_private SET insurance_policy_number = 'DM-555'").run();

    const error = await expectDomainError(
      updateProfile(t.ctx, mechanic, profileCommand(mechanic.email, { insuranceExpiresOn: "2030-12-31" })),
      "invalid_input",
    );
    expect(Object.keys(fieldErrorsOf(error))).toEqual(["insuranceExpiresOn"]);
    expect(rows("SELECT insurance_expires_on FROM mechanic_profiles")).toEqual([{ insurance_expires_on: "2026-09-01" }]);

    // Unchanged (even expired) insurance doesn't block the rest of the form.
    const saved = await updateProfile(
      t.ctx,
      mechanic,
      profileCommand(mechanic.email, { insuranceExpiresOn: "2026-09-01", phone: "480-555-0123" }),
    );
    expect(saved.changedFields).toContain("phone");
    expect(rows("SELECT insurance_expires_on FROM mechanic_profiles")).toEqual([{ insurance_expires_on: "2026-09-01" }]);
  });

  it("updateProfile keeps insurance valid in the future and refuses unknown ZIPs", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "applied" });
    let error = await expectDomainError(
      updateProfile(t.ctx, mechanic, profileCommand(mechanic.email, { insuranceExpiresOn: "2026-10-01" })),
      "invalid_input",
    );
    expect(Object.keys(fieldErrorsOf(error))).toEqual(["insuranceExpiresOn"]);
    error = await expectDomainError(
      updateProfile(t.ctx, mechanic, profileCommand(mechanic.email, { baseZip: "99999" })),
      "invalid_input",
    );
    expect(Object.keys(fieldErrorsOf(error))).toEqual(["baseZip"]);
    expect(rows("SELECT base_zip FROM mechanic_profiles")).toEqual([{ base_zip: "85004" }]);

    const noProfile = await createUser(t.ctx, { role: "mechanic" });
    await expectDomainError(updateProfile(t.ctx, noProfile, profileCommand(noProfile.email)), "conflict");
  });

  it("updateServicesAndMakes keeps approvals of kept services and starts new safety work unapproved", async () => {
    const mechanic = await createMechanic(t.ctx, {
      displayName: "Sam's Garage",
      categories: [{ id: "brake_work", safetyApproved: true }, "oil_change"],
    });
    const result = await updateServicesAndMakes(t.ctx, mechanic, {
      services: ["brake_work", "suspension_work", "battery_replacement"],
      allMakes: false,
      makes: ["Ford"],
    });
    expect(result).toEqual({
      added: ["suspension_work", "battery_replacement"],
      removed: ["oil_change"],
      pendingSafetyReview: ["suspension_work"],
    });
    expect(rows("SELECT category_id, safety_approved FROM mechanic_services ORDER BY category_id")).toEqual([
      { category_id: "battery_replacement", safety_approved: 0 },
      { category_id: "brake_work", safety_approved: 1 },
      { category_id: "suspension_work", safety_approved: 0 },
    ]);
    expect(rows("SELECT make FROM mechanic_makes")).toEqual([{ make: "Ford" }]);
    expect(rows("SELECT services_all_makes FROM mechanic_profiles")).toEqual([{ services_all_makes: 0 }]);
    const notes = rows<{ user_id: string; body: string; link_path: string }>(
      "SELECT user_id, body, link_path FROM notifications WHERE type = 'mechanic.safety_review_requested'",
    );
    expect(notes).toHaveLength(admins.length);
    expect(notes[0].body).toContain("Suspension work");
    expect(notes[0].link_path).toBe(`/admin/mechanics/${mechanic.id}`);

    const profile = await getMyMechanicProfile(t.ctx, mechanic);
    expect(profile?.services.map((service) => [service.categoryId, service.safety])).toEqual([
      ["battery_replacement", "not_required"],
      ["brake_work", "approved"],
      ["suspension_work", "pending_review"],
    ]);
  });

  it("updateServicesAndMakes lets a mechanic keep a since-disabled category but not add one", async () => {
    const mechanic = await createMechanic(t.ctx, { categories: ["oil_change", "filters"] });
    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id IN ('oil_change', 'wipers')").run();
    await updateServicesAndMakes(t.ctx, mechanic, { services: ["oil_change"], allMakes: true, makes: [] });
    expect(rows("SELECT category_id FROM mechanic_services")).toEqual([{ category_id: "oil_change" }]);
    const error = await expectDomainError(
      updateServicesAndMakes(t.ctx, mechanic, { services: ["oil_change", "wipers"], allMakes: true, makes: [] }),
      "invalid_input",
    );
    expect(fieldErrorsOf(error).services[0]).toMatch(/Wipers/);
  });

  it("setAvailability replaces the windows and re-validates overlaps", async () => {
    const mechanic = await createMechanic(t.ctx);
    expect(await setAvailability(t.ctx, mechanic, { windows: [{ weekday: 6, startMinute: 600, endMinute: 900 }] })).toEqual({
      windowCount: 1,
    });
    expect(rows("SELECT weekday, start_minute, end_minute FROM mechanic_availability")).toEqual([
      { weekday: 6, start_minute: 600, end_minute: 900 },
    ]);
    await expectDomainError(
      setAvailability(t.ctx, mechanic, {
        windows: [
          { weekday: 2, startMinute: 480, endMinute: 720 },
          { weekday: 2, startMinute: 700, endMinute: 800 },
        ],
      }),
      "invalid_input",
    );
    await expectDomainError(setAvailability(t.ctx, mechanic, { windows: [] }), "invalid_input");
  });

  it("setAcceptingJobs pauses and resumes, auditing only real changes", async () => {
    const mechanic = await createMechanic(t.ctx);
    await setAcceptingJobs(t.ctx, mechanic, { acceptingJobs: false });
    await setAcceptingJobs(t.ctx, mechanic, { acceptingJobs: false });
    expect(rows("SELECT accepting_jobs FROM mechanic_profiles")).toEqual([{ accepting_jobs: 0 }]);
    await setAcceptingJobs(t.ctx, mechanic, { acceptingJobs: true });
    expect(rows("SELECT action FROM audit_events ORDER BY rowid")).toEqual([
      { action: "mechanic.pause_jobs" },
      { action: "mechanic.resume_jobs" },
    ]);
  });

  it("addDocument stores a pending document and tells the admins", async () => {
    const mechanic = await createMechanic(t.ctx, { displayName: "Priya S." });
    const formData = new FormData();
    formData.set("document", fileOf(PDF, "renewal.pdf", "application/pdf"));
    const prepared = await prepareDocumentUpload(formData);
    if (!prepared.ok) throw new Error(JSON.stringify(prepared.fieldErrors));
    const result = await addDocument(t.ctx, mechanic, { kind: "insurance", expiresOn: "2027-10-31" }, prepared.value);
    expect(rows("SELECT id, kind, status, expires_on, file_id FROM mechanic_documents")).toEqual([
      { id: result.documentId, kind: "insurance", status: "pending", expires_on: "2027-10-31", file_id: result.fileId },
    ]);
    expect(rows("SELECT original_name, purpose FROM files")).toEqual([{ original_name: "renewal.pdf", purpose: "mechanic_document" }]);
    expect(rows<{ title: string }>("SELECT title FROM notifications WHERE type = 'mechanic.document_uploaded'")).toHaveLength(
      admins.length,
    );
    const missing = await prepareDocumentUpload(new FormData());
    expect(missing).toEqual({ ok: false, fieldErrors: { document: [expect.stringMatching(/Choose a document/)] } });
  });

  it("replaceProfilePhoto swaps the photo and deletes the old file", async () => {
    const mechanic = await createMechanic(t.ctx);
    const first = await replaceProfilePhoto(t.ctx, mechanic, await upload(await jpeg(), "a.jpg", "mechanic_profile_photo"));
    const [firstFile] = rows<{ storage_key: string }>("SELECT storage_key FROM files WHERE id = ?", first.fileId);
    const second = await replaceProfilePhoto(t.ctx, mechanic, await upload(await jpeg(90, 90), "b.jpg", "mechanic_profile_photo"));
    expect(rows("SELECT profile_photo_file_id FROM mechanic_profiles")).toEqual([{ profile_photo_file_id: second.fileId }]);
    expect(rows("SELECT id FROM files")).toEqual([{ id: second.fileId }]);
    await expect(t.ctx.storage.read(firstFile.storage_key)).rejects.toThrow();
  });
});

describe("resubmitApplication", () => {
  it("needs a complete checklist, then sends a rejected application back to review", async () => {
    const mechanic = await createMechanic(t.ctx, { status: "rejected", statusReason: "Insurance certificate unreadable" });
    const profile = await getMyMechanicProfile(t.ctx, mechanic);
    expect(profile).toMatchObject({
      canResubmit: true,
      eligibility: { canReceiveJobs: false, reason: "rejected" },
      statusReason: "Insurance certificate unreadable",
    });
    expect(profile?.eligibility.message).toContain("Insurance certificate unreadable");

    const incomplete = await expectDomainError(resubmitApplication(t.ctx, mechanic), "invalid_input");
    expect(incomplete.details?.missing).toEqual(["id_document", "insurance_document"]);

    await addDocument(t.ctx, mechanic, { kind: "id_document", expiresOn: null }, await upload(PDF, "id.pdf", "mechanic_document"));
    await addDocument(t.ctx, mechanic, { kind: "insurance", expiresOn: null }, await upload(PDF, "ins.pdf", "mechanic_document"));
    const later = withNow(t.ctx, "2026-10-06T16:00:00.000Z");
    expect(await resubmitApplication(later, mechanic)).toEqual({
      mechanicId: mechanic.id,
      status: "applied",
      submittedAt: "2026-10-06T16:00:00.000Z",
    });
    expect(rows("SELECT status, status_reason, submitted_at FROM mechanic_profiles")).toEqual([
      { status: "applied", status_reason: null, submitted_at: "2026-10-06T16:00:00.000Z" },
    ]);
    expect(rows("SELECT user_id FROM notifications WHERE type = 'mechanic.application_resubmitted' ORDER BY user_id")).toEqual(
      admins.map((admin) => ({ user_id: admin.id })).sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
    );
    const [audit] = rows<{ metadata_json: string }>("SELECT metadata_json FROM audit_events WHERE action = 'mechanic.resubmit'");
    expect(JSON.parse(audit.metadata_json)).toEqual({ previousStatus: "rejected", previousReason: "Insurance certificate unreadable" });

    const again = await expectDomainError(resubmitApplication(later, mechanic), "conflict");
    expect(again.userMessage).toMatch(/already waiting for review/);
    const approved = await createMechanic(t.ctx);
    await expectDomainError(resubmitApplication(t.ctx, approved), "conflict");
  });
});
