import { describe, expect, it } from "vitest";

import { BOOKING_CONSENTS, REQUEST_CONSENTS } from "@/lib/domain";
import {
  changeOrderDecisionSchema,
  parseCancelReservationForm,
  parseChangeOrderDecisionForm,
  parseReviewForm,
  parseSelectQuoteForm,
  reviewSchema,
  selectQuoteSchema,
} from "@/lib/validation/booking";
import {
  characterCount,
  createRepairRequestSchema,
  normalizeUsPhone,
  parseCancelRequestForm,
  parseRepairRequestForm,
  preferredDateBounds,
  preferredDateError,
  REQUEST_REQUIRED_MESSAGES,
  vehicleYearBounds,
  type RepairRequestInput,
} from "@/lib/validation/request";
import {
  ACCOUNT_DELETION_MESSAGE,
  accountDeletionMessage,
  isAccountDeletionMessage,
  parseAccountDeletionForm,
  parseSupportRequestForm,
  supportRequestSchema,
} from "@/lib/validation/support";

const NOW = new Date("2026-10-05T17:00:00.000Z");
const REQUEST_KEYS = REQUEST_CONSENTS.map((consent) => consent.key);
const BOOKING_KEYS = BOOKING_CONSENTS.map((consent) => consent.key);

type FormFields = Record<string, string | readonly string[]>;

const VALID_FORM: FormFields = {
  zip: " 85004-1234 ",
  streetAddress: "  123 Main St ",
  city: "Phoenix",
  state: "az",
  locationNotes: "",
  vehicleYear: "2016",
  vehicleMake: "Toyota",
  vehicleModel: " Camry ",
  mileage: "98,000",
  categoryId: "battery_replacement",
  description: "  The car won't start in the morning.\r\nBattery is four years old.  ",
  drivable: "no",
  preferredDate: "2026-10-07",
  preferredWindow: "morning",
  serviceMode: "mobile",
  contactPhone: "(602) 555-0142",
  contactEmail: " Owner@Example.COM ",
  acceptedConsentKeys: REQUEST_KEYS,
};

function formData(fields: FormFields): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "string") data.append(name, value);
    else for (const item of value) data.append(name, item);
  }
  return data;
}

function parse(overrides: FormFields = {}, omit: readonly string[] = []) {
  const fields = { ...VALID_FORM, ...overrides };
  for (const name of omit) delete fields[name];
  return parseRepairRequestForm(formData(fields), { now: NOW });
}

function errorsOf(result: ReturnType<typeof parse>): Record<string, string[]> {
  if (result.ok) throw new Error("expected the form to be invalid");
  return result.fieldErrors;
}

describe("parseRepairRequestForm", () => {
  it("turns a complete form into normalized, typed input", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      zip: "85004",
      streetAddress: "123 Main St",
      city: "Phoenix",
      state: "AZ",
      locationNotes: null,
      vehicleYear: 2016,
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      mileage: 98_000,
      categoryId: "battery_replacement",
      description: "The car won't start in the morning.\nBattery is four years old.",
      drivable: false,
      preferredDate: "2026-10-07",
      preferredWindow: "morning",
      serviceMode: "mobile",
      maxGarageDistanceMiles: 15,
      contactPhone: "602-555-0142",
      contactEmail: "owner@example.com",
      acceptedConsentKeys: REQUEST_KEYS,
    } satisfies RepairRequestInput);
  });

  it("accepts its own output again unchanged (the server re-validates typed input)", () => {
    const result = parse({ serviceMode: "garage", maxGarageDistanceMiles: "25", drivable: "yes" });
    if (!result.ok) throw new Error("expected valid input");
    const again = createRepairRequestSchema({ now: NOW }).safeParse(result.data);
    expect(again.success && again.data).toEqual(result.data);
    expect(result.data.maxGarageDistanceMiles).toBe(25);
    expect(result.data.drivable).toBe(true);
  });

  it("reports every missing required field by name, and nothing for optional ones", () => {
    const empty = parseRepairRequestForm(new FormData(), { now: NOW });
    expect(Object.keys(errorsOf(empty)).sort()).toEqual(
      [
        "acceptedConsentKeys",
        "categoryId",
        "contactEmail",
        "contactPhone",
        "description",
        "drivable",
        "mileage",
        "preferredDate",
        "preferredWindow",
        "serviceMode",
        "vehicleMake",
        "vehicleModel",
        "vehicleYear",
        "zip",
      ].sort(),
    );
    expect(errorsOf(empty).zip).toEqual(["Enter the ZIP code where the car is."]);
    expect(errorsOf(empty).acceptedConsentKeys).toEqual(["Tick all three statements to send your request."]);
    // The wizard shows REQUEST_REQUIRED_MESSAGES at empty fields: the same words the server uses
    // (the year select says "Choose the model year." where the server explains the range).
    for (const [field, message] of Object.entries(REQUEST_REQUIRED_MESSAGES)) {
      if (field === "vehicleYear") continue;
      expect(errorsOf(empty)[field], field).toEqual([message]);
    }
  });

  it("echoes what was typed so the form can be refilled", () => {
    const result = parse({ zip: "8500" });
    expect(result.values.zip).toBe("8500");
    expect(result.values.acceptedConsentKeys).toEqual(REQUEST_KEYS);
    expect(errorsOf(result).zip).toEqual(["Enter a 5-digit ZIP code, like 85004."]);
  });

  it("bounds the model year from 1960 to next year", () => {
    expect(vehicleYearBounds(NOW)).toEqual({ min: 1960, max: 2027 });
    expect(parse({ vehicleYear: "1960" }).ok).toBe(true);
    expect(parse({ vehicleYear: "2027" }).ok).toBe(true);
    for (const year of ["1959", "2028", "20a6", "2016.5"]) {
      expect(errorsOf(parse({ vehicleYear: year })).vehicleYear, year).toEqual([
        "Enter a model year from 1960 to 2027, like 2016.",
      ]);
    }
  });

  it("accepts mileage with commas up to 2,000,000", () => {
    const ok = parse({ mileage: "2,000,000" });
    expect(ok.ok && ok.data.mileage).toBe(2_000_000);
    expect(parse({ mileage: "0" }).ok).toBe(true);
    expect(errorsOf(parse({ mileage: "2,000,001" })).mileage).toEqual(["Enter a mileage of 2,000,000 or less."]);
    expect(errorsOf(parse({ mileage: "-5" })).mileage).toEqual(["Mileage can't be negative."]);
    expect(errorsOf(parse({ mileage: "lots" })).mileage).toEqual([
      "Enter the mileage as a whole number, like 98,000.",
    ]);
  });

  it("requires a description of 10 to 2,000 characters after trimming", () => {
    expect(errorsOf(parse({ description: "   too short " })).description).toEqual([
      "Add a little more detail: at least 10 characters.",
    ]);
    expect(parse({ description: "x".repeat(2000) }).ok).toBe(true);
    expect(errorsOf(parse({ description: "x".repeat(2001) })).description).toEqual([
      "Keep the description to 2,000 characters or fewer.",
    ]);
  });

  it("counts the minimum length in characters, as the database does (an emoji is one)", () => {
    // Five emoji are 10 UTF-16 code units but only 5 characters for SQLite's length().
    expect(characterCount("🔧🔧🔧🔧🔧")).toBe(5);
    expect(errorsOf(parse({ description: "🔧🔧🔧🔧🔧" })).description).toEqual([
      "Add a little more detail: at least 10 characters.",
    ]);
    expect(parse({ description: "🔧 Brakes squeal 🔧" }).ok).toBe(true);
  });

  it("removes control characters but keeps line breaks and tabs", () => {
    const result = parse({
      description: "\u0000Squeal when\tbraking\u0007\nat low speed.\u001b",
      vehicleModel: "Cam\u0000ry",
    });
    if (!result.ok) throw new Error("expected valid input");
    expect(result.data.description).toBe("Squeal when\tbraking\nat low speed.");
    expect(result.data.vehicleModel).toBe("Camry");
    // Nothing left but control characters: treated as empty.
    expect(errorsOf(parse({ description: "\u0000\u0000\u0000" })).description).toEqual(["Describe the problem."]);
  });

  it("only accepts listed makes, windows, modes and garage distances", () => {
    expect(errorsOf(parse({ vehicleMake: "Yugo" })).vehicleMake).toEqual(["Choose the vehicle's make."]);
    expect(errorsOf(parse({ preferredWindow: "midnight" })).preferredWindow).toBeDefined();
    expect(errorsOf(parse({ serviceMode: "teleport" })).serviceMode).toBeDefined();
    expect(errorsOf(parse({ serviceMode: "garage", maxGarageDistanceMiles: "7" })).maxGarageDistanceMiles).toEqual([
      "Choose how far you're willing to drive to a garage.",
    ]);
    const withoutDistance = parse({ serviceMode: "either" }, ["maxGarageDistanceMiles"]);
    expect(withoutDistance.ok && withoutDistance.data.maxGarageDistanceMiles).toBe(15);
  });

  it("validates the category id shape (the server checks it is enabled)", () => {
    expect(errorsOf(parse({ categoryId: "Brake Work!" })).categoryId).toEqual(["Choose the kind of repair you need."]);
  });

  it("requires all three consents and ignores unknown keys", () => {
    expect(errorsOf(parse({ acceptedConsentKeys: REQUEST_KEYS.slice(0, 2) })).acceptedConsentKeys).toEqual([
      "Tick all three statements to send your request.",
    ]);
    const extra = parse({ acceptedConsentKeys: [...REQUEST_KEYS, "marketing"] });
    expect(extra.ok && extra.data.acceptedConsentKeys).toEqual(REQUEST_KEYS);
  });

  it("validates optional address fields only when given", () => {
    expect(errorsOf(parse({ state: "Arizona" })).state).toEqual(["Use the 2-letter state code, like AZ."]);
    expect(errorsOf(parse({ streetAddress: "x".repeat(201) })).streetAddress).toBeDefined();
    const blank = parse({ streetAddress: "  ", city: "", state: "" });
    expect(blank.ok && [blank.data.streetAddress, blank.data.city, blank.data.state]).toEqual([null, null, null]);
  });

  it("validates the contact email", () => {
    expect(errorsOf(parse({ contactEmail: "not-an-email" })).contactEmail).toEqual([
      "Enter a valid email address, like name@example.com.",
    ]);
  });

  it("checks a real calendar date, and the 60-day window when today is given", () => {
    expect(errorsOf(parse({ preferredDate: "2026-02-30" })).preferredDate).toEqual(["Choose a valid date."]);
    const options = { now: NOW, todayLocal: "2026-10-05" };
    expect(parseRepairRequestForm(formData({ ...VALID_FORM, preferredDate: "2026-12-04" }), options).ok).toBe(true);
    const late = parseRepairRequestForm(formData({ ...VALID_FORM, preferredDate: "2026-12-05" }), options);
    expect(errorsOf(late).preferredDate).toEqual(["Choose a date within the next 60 days."]);
    const past = parseRepairRequestForm(formData({ ...VALID_FORM, preferredDate: "2026-10-04" }), options);
    expect(errorsOf(past).preferredDate).toEqual(["Choose today or a later date."]);
  });
});

describe("preferred date window", () => {
  it("runs from today to 60 days ahead", () => {
    expect(preferredDateBounds("2026-10-05")).toEqual({ min: "2026-10-05", max: "2026-12-04" });
    expect(preferredDateError("2026-10-05", "2026-10-05")).toBeNull();
    expect(preferredDateError("2026-12-04", "2026-10-05")).toBeNull();
    expect(preferredDateError("2026-12-05", "2026-10-05")).toMatch(/60 days/);
    expect(preferredDateError("2026-10-04", "2026-10-05")).toMatch(/today or a later date/);
  });
});

describe("normalizeUsPhone", () => {
  it.each([
    ["602-555-0142", "602-555-0142"],
    ["(602) 555-0142", "602-555-0142"],
    ["602.555.0142", "602-555-0142"],
    ["+1 602 555 0142", "602-555-0142"],
    ["16025550142", "602-555-0142"],
    ["6025550142", "602-555-0142"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeUsPhone(raw)).toBe(expected);
  });

  it.each(["555-0142", "+44 20 7946 0958", "123-456-7890", "602-055-0142", "602-555-0142 ext 5", "call me", ""])(
    "rejects %s",
    (raw) => {
      expect(normalizeUsPhone(raw)).toBeNull();
    },
  );

  it("is used by the form, with a clear message", () => {
    expect(errorsOf(parse({ contactPhone: "555-0142" })).contactPhone).toEqual([
      "Enter a 10-digit US phone number, like 602-555-0142.",
    ]);
  });
});

describe("cancel request form", () => {
  it("needs a request id and keeps the reason optional", () => {
    const data = formData({ requestId: "4b0c6d1e-0000-4000-8000-000000000001", reason: "  " });
    const parsed = parseCancelRequestForm(data);
    expect(parsed).toEqual({ ok: true, data: { requestId: "4b0c6d1e-0000-4000-8000-000000000001", reason: null } });
    const bad = parseCancelRequestForm(formData({ requestId: "../etc/passwd" }));
    expect(bad.ok).toBe(false);
  });
});

describe("booking forms", () => {
  it("selecting a quote needs every booking consent", () => {
    const all = parseSelectQuoteForm(formData({ quoteId: "quote-1", acceptedConsentKeys: BOOKING_KEYS }));
    expect(all).toEqual({ ok: true, data: { quoteId: "quote-1", acceptedConsentKeys: BOOKING_KEYS } });
    const missing = parseSelectQuoteForm(formData({ quoteId: "quote-1", acceptedConsentKeys: BOOKING_KEYS.slice(1) }));
    expect(missing.ok === false && missing.fieldErrors.acceptedConsentKeys).toEqual([
      "Tick all three statements to reserve this quote.",
    ]);
    expect(selectQuoteSchema.safeParse({ quoteId: "quote-1", acceptedConsentKeys: [] }).success).toBe(false);
  });

  it("reviews take a whole rating from 1 to 5 and an optional comment", () => {
    expect(parseReviewForm(formData({ bookingId: "b-1", rating: "5", comment: " Great " }))).toEqual({
      ok: true,
      data: { bookingId: "b-1", rating: 5, comment: "Great" },
    });
    for (const rating of ["0", "6", "4.5", ""]) {
      const parsed = parseReviewForm(formData({ bookingId: "b-1", rating }));
      expect(parsed.ok === false && parsed.fieldErrors.rating, rating).toEqual(["Choose a rating from 1 to 5 stars."]);
    }
    expect(reviewSchema.safeParse({ bookingId: "b-1", rating: 4, comment: "x".repeat(1001) }).success).toBe(false);
  });

  it("change-order decisions are approve or reject", () => {
    expect(changeOrderDecisionSchema.safeParse({ changeOrderId: "co-1", decision: "approve" }).success).toBe(true);
    expect(changeOrderDecisionSchema.safeParse({ changeOrderId: "co-1", decision: "maybe" }).success).toBe(false);
    expect(parseChangeOrderDecisionForm(formData({ changeOrderId: "co-1", decision: "reject", note: "  Not now " }))).toEqual({
      ok: true,
      data: { changeOrderId: "co-1", decision: "reject", note: "Not now" },
    });
    const missing = parseChangeOrderDecisionForm(formData({ changeOrderId: "co-1" }));
    expect(missing.ok === false && missing.fieldErrors).toEqual({
      decision: ["Choose whether to approve or decline the extra work."],
    });
  });

  it("cancelling a reservation needs its id; the reason is optional", () => {
    expect(parseCancelReservationForm(formData({ bookingId: "b-1", reason: "" }))).toEqual({
      ok: true,
      data: { bookingId: "b-1", reason: null },
    });
    const bad = parseCancelReservationForm(formData({ bookingId: "", reason: "x".repeat(501) }));
    expect(bad.ok === false && Object.keys(bad.fieldErrors).sort()).toEqual(["bookingId", "reason"]);
  });
});

describe("account deletion form", () => {
  it("takes optional details of up to 1,000 characters and builds the help request message", () => {
    expect(parseAccountDeletionForm(formData({ details: "   " }))).toEqual({ ok: true, data: { details: null } });
    expect(parseAccountDeletionForm(new FormData())).toEqual({ ok: true, data: { details: null } });
    expect(parseAccountDeletionForm(formData({ details: " Moving away.\r\nThanks! " }))).toEqual({
      ok: true,
      data: { details: "Moving away.\nThanks!" },
    });
    const tooLong = parseAccountDeletionForm(formData({ details: "x".repeat(1001) }));
    expect(tooLong.ok === false && tooLong.fieldErrors).toEqual({ details: ["Keep this to 1,000 characters or fewer."] });

    expect(accountDeletionMessage(null)).toBe(ACCOUNT_DELETION_MESSAGE);
    expect(accountDeletionMessage("Moving away.")).toBe(`${ACCOUNT_DELETION_MESSAGE}\n\nMore detail: Moving away.`);
    // Fits the help request limits with the longest details.
    const longest = accountDeletionMessage("x".repeat(1000));
    expect(supportRequestSchema.safeParse({ topic: "account", message: longest }).success).toBe(true);
    expect(isAccountDeletionMessage("account", longest)).toBe(true);
    expect(isAccountDeletionMessage("other", longest)).toBe(false);
    expect(isAccountDeletionMessage("account", "How do I change my display name?")).toBe(false);
  });
});

describe("support form", () => {
  it("validates the topic and message; linked records are optional", () => {
    const parsed = parseSupportRequestForm(
      formData({ topic: "dispute", message: "  The work took longer than quoted.  ", requestId: "", bookingId: "" }),
    );
    expect(parsed).toEqual({
      ok: true,
      data: { topic: "dispute", message: "The work took longer than quoted.", requestId: null, bookingId: null },
    });
    const bad = parseSupportRequestForm(formData({ topic: "refund_now", message: "short" }));
    expect(bad.ok === false && Object.keys(bad.fieldErrors).sort()).toEqual(["message", "topic"]);
    expect(supportRequestSchema.safeParse({ topic: "other", message: "Long enough message", bookingId: "../x" }).success).toBe(
      false,
    );
    // The 10-character minimum counts characters, like the database CHECK.
    expect(supportRequestSchema.safeParse({ topic: "other", message: "😡😡😡😡😡" }).success).toBe(false);
  });
});
