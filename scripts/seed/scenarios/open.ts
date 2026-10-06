// The sample requests still in play (docs/DEMO_DATA.md a, b, c, g, h and j-m), plus two that
// ended without a booking (q expired, r cancelled), all submitted through
// submitRepairRequest so matching is genuine. Dana compares brake quotes (one already
// expired), has a no-start job waiting for quotes and a reservation pending payment made with
// selectQuote itself; Luis has a matched request in Glendale and one in Maricopa that no
// mechanic covers; the supporting cast's requests fill the job boards and the map.
import { BOOKING_CONSENTS } from "@/lib/domain";
import { cancelRequest } from "@/server/customer/requests";
import { selectQuote } from "@/server/customer/reservations";
import { markInterested, passJob } from "@/server/mechanic/job-actions";

import { EMAIL } from "../accounts";
import { BEN_HOME, DANA_HOME, DANA_OFFICE, GRACE_HOME, LUIS_HOME, LUIS_JOB_SITE, NINA_HOME, OMAR_HOME } from "../contacts";
import { submitSampleQuote } from "../quotes";
import { submitSampleRequest } from "../requests";
import type { SeedAccounts, SeedRun } from "../types";

export type OpenScenarios = {
  brakeQuotes: string;
  noStart: string;
  pendingReservation: { requestId: string; bookingId: string };
  luisGlendale: string;
  luisNoMatch: string;
  ninaHeadlight: string;
  omarWipers: string;
  graceFilters: string;
  benMisfire: string;
  benExpired: string;
  ninaCancelled: string;
};

/**
 * (a) Brake squeal on the Civic: Priya's 24-hour quote has lapsed; Marco's and Sam's Garage's
 * are live and expire about 48 hours after seeding (times are relative to the seeding instant).
 */
async function brakeQuotes(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const preferredDate = clock.weekdayOnOrAfter(3);
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.dana), {
    at: clock.hoursAgo(27),
    request: {
      ...DANA_HOME,
      zip: "85281",
      vehicleYear: 2017,
      vehicleMake: "Honda",
      vehicleModel: "Civic LX",
      mileage: 68_400,
      categoryId: "brake_work",
      description:
        "Squealing from the front wheels when I brake at low speed, worst in the morning. It started about two weeks ago and is getting louder. No grinding, and the pedal feels normal.",
      drivable: true,
      preferredDate,
      preferredWindow: "morning",
      serviceMode: "either",
      maxGarageDistanceMiles: 15,
    },
    photos: [
      { scene: "wheel-worn", fileName: "civic-front-left-wheel.jpg" },
      { scene: "brake-worn", fileName: "civic-front-pad.jpg" },
    ],
  });

  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.priya),
    at: clock.hoursAgo(26),
    quote: {
      laborCents: 15_000,
      partsIncluded: true,
      parts: [
        { description: "Front brake pads, ceramic", quantity: 1, unitPriceCents: 5_999 },
        { description: "Front brake rotors", quantity: 2, unitPriceCents: 4_999 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_296 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "09:00"),
      durationMinutes: 120,
      serviceMode: "mobile",
      scope: "Replace the front pads and rotors, lubricate the caliper slides and road test.",
      exclusions: "Rear brakes and brake fluid.",
      notes: "This price is valid for 24 hours because parts prices change often.",
      validityHours: 24,
    },
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.marco),
    at: clock.hoursAgo(3),
    quote: {
      laborCents: 16_500,
      partsIncluded: true,
      parts: [
        { description: "Front brake pads, ceramic (2016-2021 Civic)", quantity: 1, unitPriceCents: 6_299 },
        { description: "Front brake rotors", quantity: 2, unitPriceCents: 5_499 },
        { description: "Brake hardware kit and caliper grease", quantity: 1, unitPriceCents: 1_499 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_522 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "10:00"),
      durationMinutes: 120,
      serviceMode: "mobile",
      scope:
        "Inspect the front brakes, replace the front pads and rotors, clean and lubricate the caliper slide pins, bed in the new pads and road test.",
      exclusions: "Rear brakes, calipers and a brake-fluid flush aren't included. I'll quote them separately if they need work.",
      notes: "I work in your driveway: please leave a flat spot about 6 feet wide beside the car.",
      validityHours: 48,
    },
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.sam),
    at: clock.hoursAgo(1),
    quote: {
      laborCents: 14_000,
      partsIncluded: true,
      parts: [
        { description: "Front brake pads, OEM-grade ceramic", quantity: 1, unitPriceCents: 5_800 },
        { description: "Brake hardware and slide-pin grease", quantity: 1, unitPriceCents: 1_250 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 571 }],
      fees: [{ description: "Shop supplies", amountCents: 950 }],
      earliestStartLocal: clock.localInput(preferredDate, "08:00"),
      durationMinutes: 180,
      serviceMode: "garage",
      scope:
        "Drop the car off at 8 AM. We inspect the front and rear brakes, replace the front pads, resurface the front rotors if they're within spec and road test. Ready by about 11 AM.",
      exclusions: "New rotors if yours are below minimum thickness (about $118 more): we call and ask before doing any extra work.",
      notes: "Waiting room with Wi-Fi, or we can drop you at the light rail.",
      validityHours: 48,
    },
  });
  return requestId;
}

/** (c) Battery for the Outback: Dana reserved Marco's quote; payment is pending (not connected). */
async function pendingReservation(run: SeedRun, accounts: SeedAccounts): Promise<{ requestId: string; bookingId: string }> {
  const { clock } = run;
  const dana = accounts.viewer(EMAIL.dana);
  const preferredDate = clock.weekdayOnOrAfter(2);
  const { requestId } = await submitSampleRequest(run, dana, {
    at: clock.at(-1, "11:30"),
    request: {
      ...DANA_HOME,
      zip: "85281",
      vehicleYear: 2019,
      vehicleMake: "Subaru",
      vehicleModel: "Outback",
      mileage: 54_310,
      categoryId: "battery_replacement",
      description:
        "The battery is the original from 2019. It tested weak when the oil was changed this morning, and the car cranks slowly after sitting overnight. I'd like it replaced at home.",
      drivable: true,
      preferredDate,
      preferredWindow: "afternoon",
      serviceMode: "mobile",
    },
    photos: [{ scene: "battery-worn", fileName: "outback-battery.jpg" }],
  });

  const marcoQuote = await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.marco),
    at: clock.at(-1, "12:45"),
    quote: {
      laborCents: 4_500,
      partsIncluded: true,
      parts: [{ description: "Group 35 AGM battery, 650 CCA, 3-year warranty", quantity: 1, unitPriceCents: 21_999 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_782 }],
      fees: [{ description: "Old battery recycling", amountCents: 500 }],
      earliestStartLocal: clock.localInput(preferredDate, "13:00"),
      durationMinutes: 45,
      serviceMode: "mobile",
      scope:
        "Test the battery and charging system, replace the battery, clean the terminals, check the alternator output and reset the clock and radio.",
      exclusions: "Alternator or starter repairs, if the charging test finds a problem.",
      notes: null,
      validityHours: 48,
    },
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.jordan),
    at: clock.at(-1, "15:10"),
    quote: {
      laborCents: 5_500,
      partsIncluded: true,
      parts: [{ description: "Group 35 battery (standard flooded), 640 CCA", quantity: 1, unitPriceCents: 16_999 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_377 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "15:30"),
      durationMinutes: 60,
      serviceMode: "mobile",
      scope: "Replace the battery, clean the terminals and test the charging system.",
      exclusions: null,
      notes: "Weekday visits start after 3 PM.",
      validityHours: 48,
    },
  });

  // The app's own reservation command: consent snapshot, money from pricing.ts, quote selected,
  // the other quote declined, request reserved, booking pending_payment (not a fixture).
  const reservation = await selectQuote(run.ctxAt(clock.at(-1, "20:15")), dana, {
    quoteId: marcoQuote.quoteId,
    acceptedConsentKeys: BOOKING_CONSENTS.map((consent) => consent.key),
  });
  return { requestId, bookingId: reservation.bookingId };
}

/** (b) The Camry won't start at Dana's office: matched, no quotes yet (Marco can quote it). */
async function noStart(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.dana), {
    at: clock.hoursAgo(2),
    request: {
      ...DANA_OFFICE,
      zip: "85282",
      vehicleYear: 2015,
      vehicleMake: "Toyota",
      vehicleModel: "Camry SE",
      mileage: 112_900,
      categoryId: "battery_no_start",
      description:
        "Car won't start: it clicks once and the dash lights flicker. It started fine this morning. The battery is about four years old. The car is in my office parking garage.",
      drivable: false,
      preferredDate: clock.weekdayOnOrAfter(1),
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [{ scene: "dash-no-start", fileName: "camry-dashboard.jpg" }],
  });
  return requestId;
}

/** (g) Luis's check-engine light in Glendale: matched to nearby mechanics, none of them Marco. */
async function luisGlendale(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.luis), {
    at: clock.at(-1, "17:45"),
    request: {
      ...LUIS_HOME,
      zip: "85301",
      vehicleYear: 2014,
      vehicleMake: "Nissan",
      vehicleModel: "Altima 2.5 S",
      mileage: 96_800,
      categoryId: "cel_code_read",
      description:
        "Check-engine light came on yesterday after I filled up. The car drives normally and the gas cap clicked shut. I'd like the code read before a road trip next weekend.",
      drivable: true,
      preferredDate: clock.weekdayOnOrAfter(3),
      preferredWindow: "flexible",
      serviceMode: "mobile",
    },
    photos: [{ scene: "dash-check-engine", fileName: "altima-dashboard.jpg" }],
  });
  return requestId;
}

/** (h) Luis's truck in Maricopa, a pilot ZIP no mechanic reaches: an honest zero match. */
async function luisNoMatch(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const { requestId, matchedCount } = await submitSampleRequest(run, accounts.viewer(EMAIL.luis), {
    at: clock.hoursAgo(4),
    request: {
      ...LUIS_JOB_SITE,
      zip: "85138",
      vehicleYear: 2016,
      vehicleMake: "Toyota",
      vehicleModel: "Tacoma SR",
      mileage: 143_500,
      categoryId: "battery_replacement",
      description:
        "My work truck is parked at a job site in Maricopa and the battery died again after a jump-start yesterday. It's the original battery. I need it replaced on site; any time that week works.",
      drivable: false,
      preferredDate: clock.weekdayOnOrAfter(1),
      preferredWindow: "flexible",
      serviceMode: "mobile",
    },
    photos: [{ scene: "jobsite-pickup", fileName: "tacoma-job-site.jpg" }],
  });
  if (matchedCount !== 0) throw new Error(`The Maricopa sample request should match nobody, but matched ${matchedCount}.`);
  return requestId;
}

/** (j) Nina's low beam is out in Scottsdale: Kenji and Marco both quoted for an evening visit. */
async function ninaHeadlight(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const preferredDate = clock.weekdayOnOrAfter(2);
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.nina), {
    at: clock.hoursAgo(20),
    request: {
      ...NINA_HOME,
      zip: "85251",
      vehicleYear: 2018,
      vehicleMake: "Mazda",
      vehicleModel: "CX-5 Touring",
      mileage: 61_250,
      categoryId: "bulbs",
      description:
        "The driver-side low beam went out last night; the high beam still works. Through the lens the bulb glass looks cracked and blackened. I'd like it replaced after work at my apartment.",
      drivable: true,
      preferredDate,
      preferredWindow: "evening",
      serviceMode: "mobile",
    },
    photos: [{ scene: "headlight-out", fileName: "cx5-driver-headlight.jpg" }],
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.kenji),
    at: clock.hoursAgo(16),
    quote: {
      laborCents: 3_500,
      partsIncluded: true,
      parts: [{ description: "H11 low-beam bulbs, long-life (pair)", quantity: 1, unitPriceCents: 3_299 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 267 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "17:30"),
      durationMinutes: 45,
      serviceMode: "mobile",
      scope:
        "Replace both low-beam bulbs (they dim at the same rate), check the connector for heat damage and set the headlight aim against a wall.",
      exclusions: "A new headlight housing, if moisture got in through the crack.",
      notes: "Covered parking is perfect; I bring my own light.",
      validityHours: 72,
    },
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.marco),
    at: clock.hoursAgo(5),
    quote: {
      laborCents: 4_000,
      partsIncluded: true,
      parts: [{ description: "H11 halogen low-beam bulb", quantity: 1, unitPriceCents: 1_899 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 154 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "17:15"),
      durationMinutes: 30,
      serviceMode: "mobile",
      scope: "Replace the driver-side low-beam bulb, test both headlights and check the aim.",
      exclusions: null,
      notes: null,
      validityHours: 48,
    },
  });
  return requestId;
}

/** (k) Omar's wipers streak in Gilbert: Elena quoted; Marco passed on the job (too far). */
async function omarWipers(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const preferredDate = clock.weekdayOnOrAfter(2);
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.omar), {
    at: clock.hoursAgo(26),
    request: {
      ...OMAR_HOME,
      zip: "85234",
      vehicleYear: 2020,
      vehicleMake: "Toyota",
      vehicleModel: "RAV4 XLE",
      mileage: 38_400,
      categoryId: "wipers",
      description:
        "Both wipers streak and chatter, and the driver side leaves a wide band of water right in my line of sight. Monsoon season is here, so I'd like new blades this week.",
      drivable: true,
      preferredDate,
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [{ scene: "wiper-worn", fileName: "rav4-wiper-streaks.jpg" }],
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.elena),
    at: clock.hoursAgo(22),
    quote: {
      laborCents: 2_000,
      partsIncluded: true,
      parts: [
        { description: "Beam wiper blades, 26 in and 16 in", quantity: 1, unitPriceCents: 4_298 },
        { description: "Rear wiper blade, 10 in", quantity: 1, unitPriceCents: 1_299 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 453 }],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "09:00"),
      durationMinutes: 30,
      serviceMode: "mobile",
      scope: "Replace the front and rear wiper blades, clean the glass and the wiper channels, and top off the washer fluid.",
      exclusions: null,
      notes: "I'm nearby that morning, so I can come a little earlier if you like.",
      validityHours: 72,
    },
  });
  await passJob(run.ctxAt(clock.hoursAgo(20)), accounts.viewer(EMAIL.marco), requestId);
  return requestId;
}

/** (l) Grace's musty A/C: filters job matched to three mechanics, no quotes yet; Priya is interested. */
async function graceFilters(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.grace), {
    at: clock.hoursAgo(9),
    request: {
      ...GRACE_HOME,
      zip: "85018",
      vehicleYear: 2016,
      vehicleMake: "Lexus",
      vehicleModel: "RX 350",
      mileage: 89_020,
      categoryId: "filters",
      description:
        "The A/C smells musty and the airflow is weak even on high. The engine and cabin air filters haven't been changed since I bought the car. Can you replace both at my house?",
      drivable: true,
      preferredDate: clock.weekdayOnOrAfter(4),
      preferredWindow: "afternoon",
      serviceMode: "mobile",
    },
    photos: [{ scene: "filter-dirty", fileName: "rx350-engine-air-filter.jpg" }],
  });
  await markInterested(run.ctxAt(clock.hoursAgo(7)), accounts.viewer(EMAIL.priya), requestId);
  return requestId;
}

/** (m) Ben's misfiring truck in Peoria: Westside Garage and Rosa quoted a diagnosis. */
async function benMisfire(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const preferredDate = clock.weekdayOnOrAfter(3);
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.ben), {
    at: clock.hoursAgo(23),
    request: {
      ...BEN_HOME,
      zip: "85345",
      vehicleYear: 2013,
      vehicleMake: "Chevrolet",
      vehicleModel: "Silverado 1500 LT",
      mileage: 142_300,
      categoryId: "diagnostic_visit",
      description:
        "Check-engine light on and the truck idles rough at stoplights, especially with the A/C on. A parts-store code read said P0300 (random misfire). I'd like a proper diagnosis before replacing parts.",
      drivable: true,
      preferredDate,
      preferredWindow: "flexible",
      serviceMode: "either",
      maxGarageDistanceMiles: 15,
    },
    photos: [{ scene: "dash-check-engine", fileName: "silverado-dashboard.jpg" }],
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.westside),
    at: clock.hoursAgo(20),
    quote: {
      laborCents: 12_000,
      partsIncluded: false,
      parts: [],
      taxes: [],
      fees: [{ description: "Shop supplies", amountCents: 500 }],
      earliestStartLocal: clock.localInput(preferredDate, "08:30"),
      durationMinutes: 90,
      serviceMode: "garage",
      scope:
        "Scan every module, check the misfire counters per cylinder, swap-test the coils, inspect the plugs and smoke-test for vacuum leaks. We call you with a repair quote before doing any work.",
      exclusions: "Repairs and parts: quoted separately once we know the cause.",
      notes: "Free loaner shuttle within 5 miles.",
      validityHours: 72,
    },
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.rosa),
    at: clock.hoursAgo(6),
    quote: {
      laborCents: 9_500,
      partsIncluded: false,
      parts: [],
      taxes: [],
      fees: [],
      earliestStartLocal: clock.localInput(preferredDate, "07:30"),
      durationMinutes: 60,
      serviceMode: "mobile",
      scope: "Diagnose the misfire in your driveway: code scan, live data, coil and plug check, and a vacuum-leak test if needed.",
      exclusions: "Repairs: I'll quote them separately once I know the cause.",
      notes: "Early start so you can still make it to work.",
      validityHours: 48,
    },
  });
  return requestId;
}

/** (q) Ben's oil change last week: Westside quoted, nobody was chosen, the request expired. */
async function benExpired(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const preferredDate = clock.weekdayOnOrAfter(-6);
  const { requestId } = await submitSampleRequest(run, accounts.viewer(EMAIL.ben), {
    at: clock.at(-8, "09:15"),
    request: {
      ...BEN_HOME,
      zip: "85345",
      vehicleYear: 2013,
      vehicleMake: "Chevrolet",
      vehicleModel: "Silverado 1500 LT",
      mileage: 141_980,
      categoryId: "oil_change",
      description: "Oil change with full synthetic 5W-30. Shop or driveway both work.",
      drivable: true,
      preferredDate,
      preferredWindow: "morning",
      serviceMode: "either",
      maxGarageDistanceMiles: 15,
    },
    photos: [],
  });
  await submitSampleQuote(run, {
    requestId,
    mechanic: accounts.viewer(EMAIL.westside),
    at: clock.at(-8, "13:30"),
    quote: {
      laborCents: 3_500,
      partsIncluded: true,
      parts: [
        { description: "5W-30 full synthetic oil (quart)", quantity: 7, unitPriceCents: 799 },
        { description: "Oil filter", quantity: 1, unitPriceCents: 1_099 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 542 }],
      fees: [{ description: "Used oil disposal", amountCents: 300 }],
      earliestStartLocal: clock.localInput(preferredDate, "08:00"),
      durationMinutes: 45,
      serviceMode: "garage",
      scope: "Change the oil and filter, check all fluids and tire pressures, and reset the oil-life monitor.",
      exclusions: null,
      notes: null,
      validityHours: 48,
    },
  });
  return requestId;
}

/** (r) Nina's wipers: matched, then she cancelled because she replaced the blades herself. */
async function ninaCancelled(run: SeedRun, accounts: SeedAccounts): Promise<string> {
  const { clock } = run;
  const nina = accounts.viewer(EMAIL.nina);
  const { requestId } = await submitSampleRequest(run, nina, {
    at: clock.at(-5, "19:30"),
    request: {
      ...NINA_HOME,
      zip: "85251",
      vehicleYear: 2018,
      vehicleMake: "Mazda",
      vehicleModel: "CX-5 Touring",
      mileage: 61_020,
      categoryId: "wipers",
      description: "The wipers smear in the rain. I'd like both front blades replaced.",
      drivable: true,
      preferredDate: clock.weekdayOnOrAfter(-3),
      preferredWindow: "flexible",
      serviceMode: "mobile",
    },
    photos: [],
  });
  await cancelRequest(run.ctxAt(clock.at(-4, "08:10")), nina, {
    requestId,
    reason: "I found the right blades at a parts store and swapped them myself.",
  });
  return requestId;
}

export async function seedOpenScenarios(run: SeedRun, accounts: SeedAccounts): Promise<OpenScenarios> {
  const scenarios = {
    benExpired: await benExpired(run, accounts),
    ninaCancelled: await ninaCancelled(run, accounts),
    brakeQuotes: await brakeQuotes(run, accounts),
    omarWipers: await omarWipers(run, accounts),
    benMisfire: await benMisfire(run, accounts),
    ninaHeadlight: await ninaHeadlight(run, accounts),
    pendingReservation: await pendingReservation(run, accounts),
    luisGlendale: await luisGlendale(run, accounts),
    graceFilters: await graceFilters(run, accounts),
    luisNoMatch: await luisNoMatch(run, accounts),
    noStart: await noStart(run, accounts),
  };
  run.log(
    "Open requests: brake quotes to compare (one expired), a reservation pending payment, a no-start job waiting " +
      "for quotes, Luis's Glendale request and his Maricopa request that matched nobody, four more requests across " +
      "the metro, one that expired and one the customer cancelled.",
  );
  return scenarios;
}
