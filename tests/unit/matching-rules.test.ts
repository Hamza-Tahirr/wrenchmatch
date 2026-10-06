import { describe, expect, it } from "vitest";

import { MATCH_REASONS, type MechanicStatus, type PreferredWindow } from "@/lib/domain";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import { EARTH_RADIUS_MILES, type GeoPoint } from "@/server/matching/geo";
import {
  evaluateMechanic,
  selectMechanicsToNotify,
  type MatchAvailability,
  type MatchMechanic,
  type MatchRequest,
  type MechanicEvaluation,
} from "@/server/matching/rules";

const PHOENIX: GeoPoint = { lat: 33.451, lng: -112.069 };
const MILES_PER_DEGREE_LATITUDE = (EARTH_RADIUS_MILES * Math.PI) / 180;

/** A point `miles` due north of `point`: along a meridian the haversine distance is exact. */
const northOf = (point: GeoPoint, miles: number): GeoPoint => ({
  lat: point.lat + miles / MILES_PER_DEGREE_LATITUDE,
  lng: point.lng,
});

const TODAY = "2026-10-05"; // Monday
const WEDNESDAY = "2026-10-07";
const WEDNESDAY_WEEKDAY = 3;

const EVERY_DAY_8_TO_6: MatchAvailability[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 8 * 60,
  endMinute: 18 * 60,
}));

/** Defaults: a mobile oil change in Phoenix on Wednesday morning, requested on Monday. */
function request(overrides: Partial<MatchRequest> = {}): MatchRequest {
  return {
    point: PHOENIX,
    categoryId: "oil_change",
    categorySafetySensitive: false,
    make: "Toyota",
    serviceMode: "mobile",
    maxGarageDistanceMiles: 15,
    preferredDate: WEDNESDAY,
    preferredWindow: "morning",
    todayLocal: TODAY,
    ...overrides,
  };
}

/** Defaults: an approved, insured mechanic at the request's point who passes every rule. */
function mechanic(overrides: Partial<MatchMechanic> = {}): MatchMechanic {
  return {
    id: "mechanic-a",
    status: "approved",
    acceptingJobs: true,
    insuranceProvider: "Test Mutual Insurance",
    insuranceExpiresOn: "2027-10-05",
    basePoint: PHOENIX,
    serviceMode: "both",
    travelRadiusMiles: 25,
    servicesAllMakes: true,
    makes: [],
    services: [{ categoryId: "oil_change", safetyApproved: false }],
    availability: EVERY_DAY_8_TO_6,
    ...overrides,
  };
}

const reasonsFor = (req: MatchRequest, mech: MatchMechanic) => evaluateMechanic(req, mech).reasons;

const minutes = (clock: string) => {
  const [hours, mins] = clock.split(":").map(Number);
  return hours * 60 + mins;
};
const wednesday = (from: string, to: string): MatchAvailability => ({
  weekday: WEDNESDAY_WEEKDAY,
  startMinute: minutes(from),
  endMinute: minutes(to),
});

describe("evaluateMechanic", () => {
  it("accepts a mechanic who passes every rule", () => {
    expect(evaluateMechanic(request(), mechanic())).toEqual({
      mechanicId: "mechanic-a",
      eligible: true,
      reasons: [],
      distanceMiles: 0,
      effectiveMode: "mobile",
    });
  });

  it("reports the distance between the points, rounded to 0.01 mile", () => {
    const evaluation = evaluateMechanic(request(), mechanic({ basePoint: northOf(PHOENIX, 3.14159) }));
    expect(evaluation.distanceMiles).toBe(3.14);
  });

  it("rejects malformed request dates", () => {
    expect(() => evaluateMechanic(request({ preferredDate: "2026-02-30" }), mechanic())).toThrow(RangeError);
    expect(() => evaluateMechanic(request({ todayLocal: "10/05/2026" }), mechanic())).toThrow(RangeError);
  });
});

describe("status and job intake", () => {
  it.each<MechanicStatus>(["applied", "under_review", "rejected"])(
    "reports status_not_approved for a %s mechanic",
    (status) => {
      expect(reasonsFor(request(), mechanic({ status }))).toEqual(["status_not_approved"]);
    },
  );

  it("reports a suspended mechanic as suspended, not as unapproved", () => {
    expect(reasonsFor(request(), mechanic({ status: "suspended" }))).toEqual(["suspended"]);
  });

  it("reports not_accepting_jobs when the mechanic paused new jobs", () => {
    expect(reasonsFor(request(), mechanic({ acceptingJobs: false }))).toEqual(["not_accepting_jobs"]);
  });
});

describe("insurance", () => {
  it("reports insurance_missing without an expiry date or provider", () => {
    expect(reasonsFor(request(), mechanic({ insuranceExpiresOn: null }))).toEqual(["insurance_missing"]);
    expect(reasonsFor(request(), mechanic({ insuranceProvider: null }))).toEqual(["insurance_missing"]);
    expect(reasonsFor(request(), mechanic({ insuranceProvider: "   " }))).toEqual(["insurance_missing"]);
  });

  it("counts a policy expiring today as valid for a job today", () => {
    expect(
      reasonsFor(request({ preferredDate: TODAY }), mechanic({ insuranceExpiresOn: TODAY })),
    ).toEqual([]);
  });

  it("reports insurance_expired for a policy that expired yesterday", () => {
    expect(
      reasonsFor(request({ preferredDate: TODAY }), mechanic({ insuranceExpiresOn: "2026-10-04" })),
    ).toEqual(["insurance_expired"]);
  });

  it("requires the policy to last through the preferred date", () => {
    const wednesdayJob = request({ preferredDate: WEDNESDAY });
    expect(reasonsFor(wednesdayJob, mechanic({ insuranceExpiresOn: TODAY }))).toEqual(["insurance_expired"]);
    expect(reasonsFor(wednesdayJob, mechanic({ insuranceExpiresOn: "2026-10-06" }))).toEqual([
      "insurance_expired",
    ]);
    expect(reasonsFor(wednesdayJob, mechanic({ insuranceExpiresOn: WEDNESDAY }))).toEqual([]);
  });

  it("still requires valid insurance today when the preferred date has passed", () => {
    // e.g. a rematch a few days after submission
    const pastDate = request({ preferredDate: "2026-10-02", todayLocal: TODAY });
    expect(reasonsFor(pastDate, mechanic({ insuranceExpiresOn: "2026-10-04" }))).toEqual(["insurance_expired"]);
    expect(reasonsFor(pastDate, mechanic({ insuranceExpiresOn: TODAY }))).toEqual([]);
  });
});

describe("services and makes", () => {
  it("reports category_not_offered when the mechanic does not offer the category", () => {
    expect(
      reasonsFor(request(), mechanic({ services: [{ categoryId: "wipers", safetyApproved: false }] })),
    ).toEqual(["category_not_offered"]);
    expect(reasonsFor(request(), mechanic({ services: [] }))).toEqual(["category_not_offered"]);
  });

  it("requires admin safety approval for a safety-sensitive category", () => {
    const brakes = request({ categoryId: "brake_work", categorySafetySensitive: true });
    expect(
      reasonsFor(brakes, mechanic({ services: [{ categoryId: "brake_work", safetyApproved: false }] })),
    ).toEqual(["safety_category_not_approved"]);
    expect(
      reasonsFor(brakes, mechanic({ services: [{ categoryId: "brake_work", safetyApproved: true }] })),
    ).toEqual([]);
  });

  it("reports only category_not_offered when a safety category is not offered at all", () => {
    const brakes = request({ categoryId: "brake_work", categorySafetySensitive: true });
    expect(
      reasonsFor(brakes, mechanic({ services: [{ categoryId: "suspension_work", safetyApproved: true }] })),
    ).toEqual(["category_not_offered"]);
  });

  it("ignores safety approval for categories that are not safety-sensitive", () => {
    expect(
      reasonsFor(request(), mechanic({ services: [{ categoryId: "oil_change", safetyApproved: false }] })),
    ).toEqual([]);
  });

  it("reports make_not_supported when the make is not in the mechanic's list", () => {
    expect(
      reasonsFor(request(), mechanic({ servicesAllMakes: false, makes: ["Honda", "Ford"] })),
    ).toEqual(["make_not_supported"]);
    expect(reasonsFor(request(), mechanic({ servicesAllMakes: false, makes: [] }))).toEqual([
      "make_not_supported",
    ]);
  });

  it("accepts a listed make, and any make from an all-makes mechanic", () => {
    expect(reasonsFor(request(), mechanic({ servicesAllMakes: false, makes: ["Honda", "Toyota"] }))).toEqual([]);
    expect(reasonsFor(request(), mechanic({ servicesAllMakes: true, makes: [] }))).toEqual([]);
    expect(reasonsFor(request(), mechanic({ servicesAllMakes: true, makes: ["Honda"] }))).toEqual([]);
  });
});

describe("service mode and distance", () => {
  it("matches a mobile request with mobile and mobile-and-garage mechanics only", () => {
    const mobileJob = request({ serviceMode: "mobile" });
    expect(evaluateMechanic(mobileJob, mechanic({ serviceMode: "mobile" })).effectiveMode).toBe("mobile");
    expect(evaluateMechanic(mobileJob, mechanic({ serviceMode: "both" })).effectiveMode).toBe("mobile");
    expect(evaluateMechanic(mobileJob, mechanic({ serviceMode: "garage" }))).toMatchObject({
      eligible: false,
      reasons: ["mode_mismatch"],
      effectiveMode: null,
    });
  });

  it("matches a garage request with garage and mobile-and-garage mechanics only", () => {
    const garageJob = request({ serviceMode: "garage" });
    expect(evaluateMechanic(garageJob, mechanic({ serviceMode: "garage" })).effectiveMode).toBe("garage");
    expect(evaluateMechanic(garageJob, mechanic({ serviceMode: "both" })).effectiveMode).toBe("garage");
    expect(evaluateMechanic(garageJob, mechanic({ serviceMode: "mobile" }))).toMatchObject({
      eligible: false,
      reasons: ["mode_mismatch"],
      effectiveMode: null,
    });
  });

  it("reports mode_mismatch alone, without a distance verdict for a mode the mechanic lacks", () => {
    const farGarage = mechanic({ serviceMode: "garage", basePoint: northOf(PHOENIX, 60) });
    expect(reasonsFor(request({ serviceMode: "mobile" }), farGarage)).toEqual(["mode_mismatch"]);
  });

  it("accepts a mobile job exactly at the travel radius and rejects one 0.01 mile beyond", () => {
    const mobileJob = request({ serviceMode: "mobile" });
    const atRadius = evaluateMechanic(
      mobileJob,
      mechanic({ serviceMode: "mobile", travelRadiusMiles: 10, basePoint: northOf(PHOENIX, 10) }),
    );
    expect(atRadius).toMatchObject({ eligible: true, distanceMiles: 10, effectiveMode: "mobile" });

    const beyond = evaluateMechanic(
      mobileJob,
      mechanic({ serviceMode: "mobile", travelRadiusMiles: 10, basePoint: northOf(PHOENIX, 10.01) }),
    );
    expect(beyond).toMatchObject({
      eligible: false,
      reasons: ["out_of_range"],
      distanceMiles: 10.01,
      effectiveMode: null,
    });
  });

  it("limits garage jobs by the customer's maximum garage distance, not the travel radius", () => {
    const garageJob = request({ serviceMode: "garage", maxGarageDistanceMiles: 15 });
    const shortRadius = { serviceMode: "garage" as const, travelRadiusMiles: 5 };
    expect(
      evaluateMechanic(garageJob, mechanic({ ...shortRadius, basePoint: northOf(PHOENIX, 15) })),
    ).toMatchObject({ eligible: true, distanceMiles: 15, effectiveMode: "garage" });
    expect(
      evaluateMechanic(garageJob, mechanic({ ...shortRadius, basePoint: northOf(PHOENIX, 15.01) })),
    ).toMatchObject({ eligible: false, reasons: ["out_of_range"], distanceMiles: 15.01 });
  });

  it("limits mobile jobs by the travel radius, not the customer's garage distance", () => {
    const mobileJob = request({ serviceMode: "mobile", maxGarageDistanceMiles: 25 });
    expect(
      reasonsFor(mobileJob, mechanic({ serviceMode: "both", travelRadiusMiles: 5, basePoint: northOf(PHOENIX, 10) })),
    ).toEqual(["out_of_range"]);
  });

  describe('"either" requests', () => {
    const eitherJob = request({ serviceMode: "either", maxGarageDistanceMiles: 15 });

    it("prefers mobile when both modes fit", () => {
      const both = mechanic({ serviceMode: "both", travelRadiusMiles: 25, basePoint: northOf(PHOENIX, 10) });
      expect(evaluateMechanic(eitherJob, both)).toMatchObject({ eligible: true, effectiveMode: "mobile" });
    });

    it("falls back to garage when the request is beyond the travel radius", () => {
      const both = mechanic({ serviceMode: "both", travelRadiusMiles: 5, basePoint: northOf(PHOENIX, 10) });
      expect(evaluateMechanic(eitherJob, both)).toMatchObject({ eligible: true, effectiveMode: "garage" });
    });

    it("matches a garage-only mechanic within the garage distance", () => {
      const garage = mechanic({ serviceMode: "garage", basePoint: northOf(PHOENIX, 12) });
      expect(evaluateMechanic(eitherJob, garage)).toMatchObject({ eligible: true, effectiveMode: "garage" });
    });

    it("reports out_of_range for a mobile-only mechanic beyond the radius, even within the garage distance", () => {
      const mobile = mechanic({ serviceMode: "mobile", travelRadiusMiles: 5, basePoint: northOf(PHOENIX, 10) });
      expect(evaluateMechanic(eitherJob, mobile)).toMatchObject({
        eligible: false,
        reasons: ["out_of_range"],
        effectiveMode: null,
      });
    });

    it("reports out_of_range when neither mode reaches", () => {
      const far = mechanic({ serviceMode: "both", travelRadiusMiles: 25, basePoint: northOf(PHOENIX, 30) });
      expect(reasonsFor(eitherJob, far)).toEqual(["out_of_range"]);
    });
  });
});

describe("availability", () => {
  it("checks windows on the preferred weekday only", () => {
    const job = request({ preferredDate: WEDNESDAY, preferredWindow: "morning" });
    expect(reasonsFor(job, mechanic({ availability: [wednesday("08:00", "12:00")] }))).toEqual([]);
    const tuesday: MatchAvailability = { weekday: 2, startMinute: 480, endMinute: 720 };
    const thursday: MatchAvailability = { weekday: 4, startMinute: 480, endMinute: 720 };
    expect(reasonsFor(job, mechanic({ availability: [tuesday, thursday] }))).toEqual(["no_availability"]);
    expect(reasonsFor(job, mechanic({ availability: [] }))).toEqual(["no_availability"]);
  });

  // Preferred windows: morning 08:00-12:00, afternoon 12:00-17:00, evening 17:00-20:00.
  it.each<[PreferredWindow, string, string, boolean]>([
    ["morning", "11:30", "13:00", true],
    ["morning", "06:00", "08:00", false], // ends exactly when the window starts
    ["morning", "06:00", "08:01", true],
    ["morning", "12:00", "17:00", false], // starts exactly when the window ends
    ["afternoon", "08:00", "12:00", false],
    ["afternoon", "08:00", "12:01", true],
    ["afternoon", "16:59", "18:00", true],
    ["afternoon", "17:00", "20:00", false],
    ["evening", "08:00", "17:00", false],
    ["evening", "08:00", "17:30", true],
    ["evening", "19:59", "21:00", true],
    ["evening", "20:00", "22:00", false],
    ["evening", "00:00", "24:00", true],
  ])("%s request, mechanic available %s-%s on that day: overlaps = %s", (timeWindow, from, to, overlaps) => {
    const job = request({ preferredDate: WEDNESDAY, preferredWindow: timeWindow });
    expect(reasonsFor(job, mechanic({ availability: [wednesday(from, to)] }))).toEqual(
      overlaps ? [] : ["no_availability"],
    );
  });

  it("accepts any window in the week for a flexible request", () => {
    const flexible = request({ preferredDate: WEDNESDAY, preferredWindow: "flexible" });
    const sundayEvening: MatchAvailability = { weekday: 0, startMinute: minutes("18:00"), endMinute: minutes("19:00") };
    expect(reasonsFor(flexible, mechanic({ availability: [sundayEvening] }))).toEqual([]);
    expect(reasonsFor(flexible, mechanic({ availability: [] }))).toEqual(["no_availability"]);
  });
});

describe("collecting reasons", () => {
  it("reports suspended and not accepting jobs together with every other failure", () => {
    const everythingWrong = mechanic({
      status: "suspended",
      acceptingJobs: false,
      insuranceExpiresOn: "2026-10-04",
      services: [{ categoryId: "wipers", safetyApproved: false }],
      servicesAllMakes: false,
      makes: ["Honda"],
      serviceMode: "both",
      travelRadiusMiles: 10,
      basePoint: northOf(PHOENIX, 40),
      availability: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
    });
    expect(evaluateMechanic(request(), everythingWrong)).toEqual({
      mechanicId: "mechanic-a",
      eligible: false,
      reasons: [
        "suspended",
        "not_accepting_jobs",
        "insurance_expired",
        "category_not_offered",
        "make_not_supported",
        "out_of_range",
        "no_availability",
      ],
      distanceMiles: 40,
      effectiveMode: null,
    });
  });

  it("combines an unapproved status with missing insurance, safety approval and mode", () => {
    const brakes = request({ categoryId: "brake_work", categorySafetySensitive: true, serviceMode: "garage" });
    const applicant = mechanic({
      status: "applied",
      acceptingJobs: false,
      insuranceProvider: null,
      insuranceExpiresOn: null,
      services: [{ categoryId: "brake_work", safetyApproved: false }],
      serviceMode: "mobile",
    });
    expect(reasonsFor(brakes, applicant)).toEqual([
      "status_not_approved",
      "not_accepting_jobs",
      "insurance_missing",
      "safety_category_not_approved",
      "mode_mismatch",
    ]);
  });

  it("lists reasons in MATCH_REASONS order", () => {
    const reasons = reasonsFor(
      request({ preferredWindow: "evening" }),
      mechanic({
        status: "rejected",
        insuranceExpiresOn: null,
        servicesAllMakes: false,
        makes: [],
        serviceMode: "garage",
        availability: [],
      }),
    );
    const order = reasons.map((reason) => MATCH_REASONS.indexOf(reason));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(reasons).toEqual([
      "status_not_approved",
      "insurance_missing",
      "make_not_supported",
      "mode_mismatch",
      "no_availability",
    ]);
  });
});

describe("selectMechanicsToNotify", () => {
  const evaluation = (mechanicId: string, distanceMiles: number, eligible = true): MechanicEvaluation => ({
    mechanicId,
    eligible,
    reasons: eligible ? [] : ["out_of_range"],
    distanceMiles,
    effectiveMode: eligible ? "mobile" : null,
  });

  const pool: readonly MechanicEvaluation[] = [
    evaluation("m-07", 7.5),
    evaluation("m-02", 1.25),
    evaluation("m-05", 0.5, false),
    evaluation("m-03", 1.25),
    evaluation("m-01", 1.25),
    evaluation("m-09", 3),
    evaluation("m-04", 12),
    evaluation("m-06", 9.99),
  ];
  const ids = (selected: MechanicEvaluation[]) => selected.map((entry) => entry.mechanicId);

  it("returns the closest eligible mechanics, ties by id, capped at the maximum", () => {
    expect(MAX_MECHANICS_NOTIFIED).toBe(5);
    expect(ids(selectMechanicsToNotify(pool, MAX_MECHANICS_NOTIFIED))).toEqual([
      "m-01",
      "m-02",
      "m-03",
      "m-09",
      "m-07",
    ]);
  });

  it("gives the same order whatever the input order, without changing the input", () => {
    const reversed = [...pool].reverse();
    const snapshot = [...reversed];
    expect(ids(selectMechanicsToNotify(reversed, 5))).toEqual(ids(selectMechanicsToNotify(pool, 5)));
    expect(reversed).toEqual(snapshot);
  });

  it("never returns an ineligible mechanic, however close", () => {
    const selected = selectMechanicsToNotify(pool, 100);
    expect(ids(selected)).not.toContain("m-05");
    expect(ids(selected)).toEqual(["m-01", "m-02", "m-03", "m-09", "m-07", "m-06", "m-04"]);
  });

  it("returns nothing for a maximum of zero or no eligible mechanics", () => {
    expect(selectMechanicsToNotify(pool, 0)).toEqual([]);
    expect(selectMechanicsToNotify([evaluation("m-05", 0.5, false)], 5)).toEqual([]);
    expect(selectMechanicsToNotify([], 5)).toEqual([]);
  });

  it("rejects a maximum that is negative or not a whole number", () => {
    for (const max of [-1, 1.5, Number.NaN]) {
      expect(() => selectMechanicsToNotify(pool, max), String(max)).toThrow(RangeError);
    }
  });

  it("caps real evaluations at five, closest first", () => {
    const distances = [14, 2, 9, 0, 21, 5, 11];
    const evaluations = distances.map((miles, index) =>
      evaluateMechanic(request(), mechanic({ id: `mech-${index}`, basePoint: northOf(PHOENIX, miles) })),
    );
    const selected = selectMechanicsToNotify(evaluations, MAX_MECHANICS_NOTIFIED);
    expect(selected.map((entry) => entry.distanceMiles)).toEqual([0, 2, 5, 9, 11]);
    expect(ids(selected)).toEqual(["mech-3", "mech-1", "mech-5", "mech-2", "mech-6"]);
  });
});
