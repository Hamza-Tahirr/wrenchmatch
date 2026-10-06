// The admin form and filter schemas (src/lib/validation/admin.ts) as Server Actions use
// them: FormData strings in, typed domain input or field errors keyed by form field out.
import { describe, expect, it } from "vitest";

import {
  adminFieldErrors,
  adminFormValues,
  auditListQuerySchema,
  type AdminActionState,
  type AdminRevealState,
  demoPayoutHoldSchema,
  documentReviewSchema,
  INITIAL_ADMIN_ACTION_STATE,
  inviteMechanicSchema,
  mechanicListQuerySchema,
  mechanicStatusChangeSchema,
  normalizeTimeZone,
  pilotZipFormSchema,
  requestListQuerySchema,
  rerunMatchingSchema,
  safetyApprovalSchema,
  supportResolutionSchema,
} from "@/lib/validation/admin";
import { adminActionFailure, adminValidationFailure } from "@/server/admin/action-result";
import { DomainError } from "@/server/errors";

const ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

function form(entries: Record<string, string>): Record<string, FormDataEntryValue> {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return Object.fromEntries(data);
}

function fieldErrors(result: { success: boolean; error?: Parameters<typeof adminFieldErrors>[0] }) {
  expect(result.success).toBe(false);
  return result.error ? adminFieldErrors(result.error) : {};
}

describe("pilotZipFormSchema", () => {
  const base = { zip: " 80202 ", metroLabel: " Denver metro " };

  it("needs no location for a known ZIP; an unticked checkbox means disabled", () => {
    const result = pilotZipFormSchema.safeParse(form({ ...base, city: "", state: "", lat: "", lng: "", timeZone: "" }));
    expect(result.success && result.data).toEqual({ zip: "80202", metroLabel: "Denver metro", enabled: false, centroid: undefined });
  });

  it("turns a complete location into a centroid", () => {
    const result = pilotZipFormSchema.safeParse(
      form({ ...base, enabled: "on", city: "Denver", state: "co", lat: "39.74", lng: " -104.99 ", timeZone: "US/Mountain" }),
    );
    expect(result.success && result.data).toEqual({
      zip: "80202",
      metroLabel: "Denver metro",
      enabled: true,
      centroid: { city: "Denver", state: "CO", lat: 39.74, lng: -104.99, timeZone: "America/Denver" },
    });
  });

  it("asks for every location field once one is filled in, and checks each", () => {
    expect(fieldErrors(pilotZipFormSchema.safeParse(form({ ...base, city: "Denver" })))).toEqual({
      state: ["Enter the 2-letter state code, such as AZ."],
      lat: [expect.stringContaining("latitude")],
      lng: [expect.stringContaining("longitude")],
      timeZone: [expect.stringContaining("IANA time zone")],
    });
    expect(
      fieldErrors(
        pilotZipFormSchema.safeParse(
          form({ ...base, city: "Denver", state: "Colorado", lat: "north", lng: "-104.99", timeZone: "Mountain Time" }),
        ),
      ),
    ).toEqual({
      state: ["Enter the 2-letter state code, such as AZ."],
      lat: [expect.stringContaining("latitude")],
      timeZone: [expect.stringContaining("IANA time zone")],
    });
    expect(fieldErrors(pilotZipFormSchema.safeParse(form({ zip: "8020", metroLabel: "" })))).toEqual({
      zip: ["Enter a 5-digit ZIP code."],
      metroLabel: [expect.stringContaining("metro area label")],
    });
  });
});

describe("normalizeTimeZone", () => {
  it.each([
    ["America/Phoenix", "America/Phoenix"],
    ["america/new_york", "America/New_York"],
    ["UTC", "UTC"],
    ["Etc/GMT+7", "Etc/GMT+7"],
  ])("accepts %s as %s", (input, expected) => {
    expect(normalizeTimeZone(input)).toBe(expected);
  });

  it.each(["EST", "+07:00", "Mars/Olympus_Mons", "", "Phoenix"])("refuses %j", (input) => {
    expect(normalizeTimeZone(input)).toBeNull();
  });
});

describe("review forms", () => {
  it("requires a reason only to reject or suspend", () => {
    expect(mechanicStatusChangeSchema.safeParse(form({ mechanicId: ID, status: "approved", reason: "" })).data).toEqual({
      mechanicId: ID,
      status: "approved",
      reason: undefined,
    });
    expect(fieldErrors(mechanicStatusChangeSchema.safeParse(form({ mechanicId: ID, status: "suspended", reason: " ok " })))).toEqual({
      reason: ["Give a reason for suspending (at least 3 characters). The mechanic will see it."],
    });
    expect(fieldErrors(mechanicStatusChangeSchema.safeParse(form({ mechanicId: ID, status: "applied" })))).toEqual({
      status: ["Choose the new status."],
    });
    expect(fieldErrors(mechanicStatusChangeSchema.safeParse(form({ mechanicId: "x/../y", status: "approved" })))).toEqual({
      mechanicId: [expect.stringContaining("could not be identified")],
    });
  });

  it("parses hidden true/false fields and requires them", () => {
    expect(safetyApprovalSchema.safeParse(form({ mechanicId: ID, categoryId: "brake_work", approved: "false" })).data).toEqual({
      mechanicId: ID,
      categoryId: "brake_work",
      approved: false,
    });
    expect(fieldErrors(demoPayoutHoldSchema.safeParse(form({ bookingId: ID, reason: "Checking invoice" })))).toEqual({
      hold: ["Choose whether to hold or release the payout."],
    });
    expect(demoPayoutHoldSchema.safeParse({ bookingId: ID, hold: true, reason: "Checking invoice" }).data?.hold).toBe(true);
  });

  it("needs a note to reject a document and a resolution to close a help request", () => {
    expect(documentReviewSchema.safeParse(form({ documentId: ID, status: "verified", note: "  " })).data).toEqual({
      documentId: ID,
      status: "verified",
      note: undefined,
    });
    expect(Object.keys(fieldErrors(documentReviewSchema.safeParse(form({ documentId: ID, status: "rejected" }))))).toEqual(["note"]);
    expect(Object.keys(fieldErrors(supportResolutionSchema.safeParse(form({ supportRequestId: ID, resolutionNote: "ok" }))))).toEqual([
      "resolutionNote",
    ]);
  });

  it("identifies the request to re-run matching for", () => {
    expect(rerunMatchingSchema.safeParse(form({ requestId: ` ${ID} ` })).data).toEqual({ requestId: ID });
    expect(Object.keys(fieldErrors(rerunMatchingSchema.safeParse(form({ requestId: "../x" }))))).toEqual(["requestId"]);
  });

  it("normalizes invitation emails", () => {
    expect(inviteMechanicSchema.safeParse(form({ email: " Pat@Example.COM ", name: "", note: "" })).data).toEqual({
      email: "pat@example.com",
      name: undefined,
      note: undefined,
    });
    expect(Object.keys(fieldErrors(inviteMechanicSchema.safeParse(form({ email: "pat@" }))))).toEqual(["email"]);
  });
});

describe("action form states", () => {
  it("turn schema failures and domain errors into form state, rethrowing anything else", () => {
    const parsed = demoPayoutHoldSchema.safeParse(form({ bookingId: ID, reason: "x" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(adminValidationFailure(parsed.error)).toEqual({
        ok: false,
        formError: "Check the highlighted fields and try again.",
        fieldErrors: { hold: [expect.any(String)], reason: [expect.any(String)] },
      });
    }

    const withFields = new DomainError("invalid_input", "Enter the city.", { fieldErrors: { city: ["Enter the city."] } });
    expect(adminActionFailure(withFields)).toEqual({ ok: false, formError: "Enter the city.", fieldErrors: { city: ["Enter the city."] } });
    expect(adminActionFailure(new DomainError("payment_not_connected", "Stripe is not connected."))).toEqual({
      ok: false,
      formError: "Stripe is not connected.",
    });
    const unexpected = new Error("database is locked");
    expect(() => adminActionFailure(unexpected)).toThrow(unexpected);
  });

  it("echo the submitted text fields so the form can be refilled", () => {
    const data = new FormData();
    data.append("$ACTION_ID_abc123", "");
    data.append("zip", "80202");
    data.append("metroLabel", "Denver metro");
    data.append("makes", "Ford");
    data.append("makes", "Honda");
    data.append("document", new Blob(["%PDF"]), "policy.pdf");
    data.append("toString", "a field named like an Object method");
    const values = adminFormValues(data);
    expect(values).toEqual({ zip: "80202", metroLabel: "Denver metro", makes: "Ford", toString: "a field named like an Object method" });

    const parsed = pilotZipFormSchema.safeParse({ zip: values.zip, metroLabel: values.metroLabel });
    expect(parsed.success).toBe(true);
    const failure = adminActionFailure(new DomainError("invalid_input", "Enter the city.", { fieldErrors: { city: ["Enter the city."] } }), values);
    expect(failure).toEqual({ ok: false, formError: "Enter the city.", fieldErrors: { city: ["Enter the city."] }, values });
    expect(INITIAL_ADMIN_ACTION_STATE).toEqual({ ok: false });
    // one initial state fits both kinds of admin form state
    const actionState: AdminActionState = INITIAL_ADMIN_ACTION_STATE;
    const revealState: AdminRevealState<{ phone: string }> = INITIAL_ADMIN_ACTION_STATE;
    expect([actionState.ok, revealState.ok]).toEqual([false, false]);
  });
});

describe("list filters", () => {
  it("parse search params leniently", () => {
    expect(requestListQuerySchema.parse({ status: "active", zeroMatchesOnly: "1", page: "3" })).toEqual({
      status: "active",
      zeroMatchesOnly: true,
      page: 3,
    });
    expect(requestListQuerySchema.parse({ status: "nonsense", zeroMatchesOnly: "maybe", page: "-2" })).toEqual({
      status: undefined,
      zeroMatchesOnly: false,
      page: 1,
    });
    expect(requestListQuerySchema.parse({})).toEqual({ status: undefined, zeroMatchesOnly: false, page: 1 });
    expect(mechanicListQuerySchema.parse({ status: ["awaiting_review", "approved"], query: "  marco " })).toEqual({
      status: "awaiting_review",
      query: "marco",
    });
    expect(auditListQuerySchema.parse({ entityType: "", action: "mechanic.approved", page: 2 })).toEqual({
      entityType: undefined,
      action: "mechanic.approved",
      page: 2,
    });
  });
});
