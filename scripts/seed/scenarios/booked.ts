// Post-booking sample records (docs/DEMO_DATA.md d-f and n-p). Dana: a confirmed booking with
// Marco tomorrow and a change order awaiting her approval; yesterday's completed job with
// Marco (an approved change order, an issued invoice, payout pending, no review yet); last
// week's completed job at Sam's Garage, already reviewed. The supporting cast: Hannah's
// battery job with Priya (a declined change order, invoiced), Omar's truck at Sam's Garage
// (in progress, waiting on a caliper he approved) and Grace's maintenance visit with Elena
// (completed and reviewed). After insertion, every step runs through the app's own commands
// as the mechanic or the customer.
import { addDaysToDate } from "@/lib/time";
import { decideChangeOrder, submitReview } from "@/server/customer/post-booking";
import { completeJob, issueInvoice, proposeChangeOrder, startJob } from "@/server/mechanic/booking-commands";

import { EMAIL } from "../accounts";
import { DANA_HOME, GRACE_HOME, HANNAH_HOME, OMAR_WORK } from "../contacts";
import { insertBookedFixture, type BookedFixture } from "../fixtures";
import type { SeedAccounts, SeedRun } from "../types";

export type BookedScenarios = {
  confirmedBooking: BookedFixture;
  completedInvoiced: BookedFixture;
  completedReviewed: BookedFixture;
  hannahBattery: BookedFixture & { jobDay: string };
  omarBrakes: BookedFixture & { jobDay: string };
  graceService: BookedFixture & { jobDay: string };
};

/** (f) Last week: Sam's Garage fixed a suspension clunk on the Outback; Dana left a review. */
async function completedReviewed(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture> {
  const { clock } = run;
  const dana = accounts.viewer(EMAIL.dana);
  const sam = accounts.viewer(EMAIL.sam);
  const jobDay = clock.weekdayOnOrBefore(-6);
  const fixture = await insertBookedFixture(run, {
    customer: dana,
    mechanic: sam,
    submittedAt: clock.onDate(addDaysToDate(jobDay, -3), "19:05"),
    quotedAt: clock.onDate(addDaysToDate(jobDay, -2), "08:30"),
    bookedAt: clock.onDate(addDaysToDate(jobDay, -2), "12:10"),
    request: {
      ...DANA_HOME,
      zip: "85281",
      vehicleYear: 2019,
      vehicleMake: "Subaru",
      vehicleModel: "Outback",
      mileage: 53_980,
      categoryId: "suspension_work",
      description:
        "Clunking from the front left over speed bumps and driveway dips, for about a month. No pulling, and the tires wear evenly.",
      drivable: true,
      preferredDate: jobDay,
      preferredWindow: "morning",
      serviceMode: "garage",
    },
    photos: [{ scene: "suspension-worn", fileName: "outback-front-left-suspension.jpg" }],
    quote: {
      laborCents: 13_500,
      partsIncluded: true,
      parts: [{ description: "Front sway bar end links", quantity: 2, unitPriceCents: 3_850 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 624 }],
      fees: [{ description: "Shop supplies", amountCents: 800 }],
      earliestStartLocal: clock.localInput(jobDay, "08:00"),
      durationMinutes: 150,
      serviceMode: "garage",
      scope: "Inspect the front suspension, replace both front sway bar end links, torque to spec and road test over speed bumps.",
      exclusions: "Struts and control arms, if the inspection finds wear: we'd call you before doing anything else.",
      notes: "Drop-off at 8 AM; ready by late morning.",
      validityHours: 48,
    },
  });
  await startJob(run.ctxAt(clock.onDate(jobDay, "08:10")), sam, fixture.bookingId);
  await completeJob(run.ctxAt(clock.onDate(jobDay, "10:25")), sam, fixture.bookingId);
  await issueInvoice(run.ctxAt(clock.onDate(jobDay, "10:40")), sam, {
    bookingId: fixture.bookingId,
    notes: "Replaced both front sway bar end links. Struts and control arms checked: no play.",
  });
  await submitReview(run.ctxAt(clock.onDate(addDaysToDate(jobDay, 1), "18:20")), dana, {
    bookingId: fixture.bookingId,
    rating: 5,
    comment:
      "Found the clunk in ten minutes (worn sway bar links), showed me the old parts and had the car back before lunch. The price matched the quote exactly.",
  });
  return fixture;
}

/** (e) Yesterday: Marco changed the Outback's oil, added wiper blades Dana approved, and invoiced. */
async function completedInvoiced(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture> {
  const { clock } = run;
  const dana = accounts.viewer(EMAIL.dana);
  const marco = accounts.viewer(EMAIL.marco);
  const jobDay = clock.date(-1);
  const fixture = await insertBookedFixture(run, {
    customer: dana,
    mechanic: marco,
    submittedAt: clock.at(-3, "20:10"),
    quotedAt: clock.at(-2, "08:45"),
    bookedAt: clock.at(-2, "13:30"),
    request: {
      ...DANA_HOME,
      zip: "85281",
      vehicleYear: 2019,
      vehicleMake: "Subaru",
      vehicleModel: "Outback",
      mileage: 54_290,
      categoryId: "oil_change",
      description: "Oil change due: the oil-life reminder says 5%. Full synthetic, please. The car is in my driveway.",
      drivable: true,
      preferredDate: jobDay,
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [{ scene: "dash-oil-life", fileName: "outback-oil-life.jpg" }],
    quote: {
      laborCents: 4_000,
      partsIncluded: true,
      parts: [
        { description: "0W-20 full synthetic oil (quart)", quantity: 5, unitPriceCents: 849 },
        { description: "Oil filter", quantity: 1, unitPriceCents: 999 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 425 }],
      fees: [{ description: "Used oil disposal", amountCents: 400 }],
      earliestStartLocal: clock.localInput(jobDay, "10:00"),
      durationMinutes: 60,
      serviceMode: "mobile",
      scope: "Change the engine oil and filter, check fluid levels and tire pressures, and reset the oil-life reminder.",
      exclusions: null,
      notes: null,
      validityHours: 48,
    },
  });
  await startJob(run.ctxAt(clock.onDate(jobDay, "10:04")), marco, fixture.bookingId);
  const wipers = await proposeChangeOrder(run.ctxAt(clock.onDate(jobDay, "10:22")), marco, {
    bookingId: fixture.bookingId,
    description: "Replace both front wiper blades",
    reason: "Both blades are split and streak across the windshield. I showed them to you on site.",
    laborCents: 1_000,
    partsCents: 3_298,
    taxCents: 267,
  });
  await decideChangeOrder(run.ctxAt(clock.onDate(jobDay, "10:28")), dana, {
    changeOrderId: wipers.changeOrderId,
    decision: "approve",
    note: "Go ahead, thanks for checking.",
  });
  await completeJob(run.ctxAt(clock.onDate(jobDay, "11:02")), marco, fixture.bookingId);
  await issueInvoice(run.ctxAt(clock.onDate(jobDay, "11:12")), marco, {
    bookingId: fixture.bookingId,
    notes: "Next oil change in about 6,000 miles or 6 months. The battery tested weak (about 60% health).",
  });
  return fixture;
}

/** (d) Tomorrow: Marco fixes the Escape's misfire; his spark-plug change order awaits Dana. */
async function confirmedBooking(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture> {
  const { clock } = run;
  const dana = accounts.viewer(EMAIL.dana);
  const marco = accounts.viewer(EMAIL.marco);
  const tomorrow = clock.date(1);
  const fixture = await insertBookedFixture(run, {
    customer: dana,
    mechanic: marco,
    submittedAt: clock.at(-4, "19:20"),
    quotedAt: clock.at(-3, "08:15"),
    bookedAt: clock.at(-3, "12:40"),
    request: {
      ...DANA_HOME,
      zip: "85281",
      vehicleYear: 2012,
      vehicleMake: "Ford",
      vehicleModel: "Escape SE",
      mileage: 131_200,
      categoryId: "minor_engine_sensor",
      description:
        "Check-engine light came on and the engine shakes at idle, worse with the A/C on. A parts-store scan showed P0302 (cylinder 2 misfire). The light isn't flashing. I don't think the spark plugs have ever been changed.",
      drivable: true,
      preferredDate: tomorrow,
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [
      { scene: "dash-check-engine", fileName: "escape-dashboard.jpg" },
      { scene: "coils-cracked", fileName: "escape-coil-packs.jpg" },
    ],
    quote: {
      laborCents: 9_500,
      partsIncluded: true,
      parts: [{ description: "Ignition coil (cylinder 2)", quantity: 1, unitPriceCents: 6_499 }],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 526 }],
      fees: [],
      earliestStartLocal: clock.localInput(tomorrow, "10:00"),
      durationMinutes: 90,
      serviceMode: "mobile",
      scope: "Confirm the cylinder 2 misfire with a coil swap test, replace the ignition coil if it's at fault, clear the codes and road test.",
      exclusions: "Spark plugs, fuel injectors and vacuum leaks: I'll quote them separately if needed.",
      notes: null,
      validityHours: 48,
    },
  });
  await proposeChangeOrder(run.ctxAt(clock.at(-1, "18:30")), marco, {
    bookingId: fixture.bookingId,
    description: "Replace all four spark plugs while the ignition coils are off",
    reason:
      "Your photos and the service sticker suggest the original plugs at 131,000 miles. Worn plugs are a common cause of coil failure, and doing them now avoids removing the coils twice.",
    laborCents: 6_000,
    partsCents: 4_400,
    taxCents: 356,
  });
  return fixture;
}

/** (n) Last week: Priya replaced Hannah's corroded battery; Hannah declined a cabin filter. */
async function hannahBattery(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture & { jobDay: string }> {
  const { clock } = run;
  const hannah = accounts.viewer(EMAIL.hannah);
  const priya = accounts.viewer(EMAIL.priya);
  const jobDay = clock.weekdayOnOrBefore(-8);
  const fixture = await insertBookedFixture(run, {
    customer: hannah,
    mechanic: priya,
    submittedAt: clock.onDate(addDaysToDate(jobDay, -2), "18:40"),
    quotedAt: clock.onDate(addDaysToDate(jobDay, -1), "07:55"),
    bookedAt: clock.onDate(addDaysToDate(jobDay, -1), "12:20"),
    request: {
      ...HANNAH_HOME,
      zip: "85225",
      vehicleYear: 2017,
      vehicleMake: "Hyundai",
      vehicleModel: "Elantra SE",
      mileage: 71_640,
      categoryId: "battery_replacement",
      description:
        "Slow crank every morning this week and the battery terminals are covered in white and blue crust. It's the original battery. I'd like it replaced at home before it leaves me stranded.",
      drivable: true,
      preferredDate: jobDay,
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [
      { scene: "battery-corroded", fileName: "elantra-battery-terminals.jpg" },
      { scene: "driveway-hazards", fileName: "elantra-slow-crank.jpg" },
    ],
    quote: {
      laborCents: 5_500,
      partsIncluded: true,
      parts: [
        { description: "Group 47 battery, 600 CCA, 3-year warranty", quantity: 1, unitPriceCents: 18_999 },
        { description: "Terminal cleaning and anti-corrosion kit", quantity: 1, unitPriceCents: 899 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_612 }],
      fees: [{ description: "Old battery recycling", amountCents: 500 }],
      earliestStartLocal: clock.localInput(jobDay, "09:00"),
      durationMinutes: 60,
      serviceMode: "mobile",
      scope:
        "Test the battery and charging system, clean the corrosion off the cables and tray, replace the battery, protect the terminals and check the alternator output.",
      exclusions: "Cable ends, if the corrosion has eaten into them: I'd show you and quote them first.",
      notes: "I'll text when I'm on the way.",
      validityHours: 48,
    },
  });
  await startJob(run.ctxAt(clock.onDate(jobDay, "09:06")), priya, fixture.bookingId);
  const filter = await proposeChangeOrder(run.ctxAt(clock.onDate(jobDay, "09:31")), priya, {
    bookingId: fixture.bookingId,
    description: "Replace the cabin air filter",
    reason: "While the hood was open I checked the cabin filter: it's dark with dust, which is why the A/C airflow is weak.",
    laborCents: 1_000,
    partsCents: 2_499,
    taxCents: 202,
  });
  await decideChangeOrder(run.ctxAt(clock.onDate(jobDay, "09:41")), hannah, {
    changeOrderId: filter.changeOrderId,
    decision: "reject",
    note: "Not today, thanks. I'll pick one up and swap it myself.",
  });
  await completeJob(run.ctxAt(clock.onDate(jobDay, "09:58")), priya, fixture.bookingId);
  await issueInvoice(run.ctxAt(clock.onDate(jobDay, "10:09")), priya, {
    bookingId: fixture.bookingId,
    notes: "Cleaned the corrosion off both cable ends and the tray. Charging system 14.2 V at idle: the alternator is fine.",
  });
  return { ...fixture, jobDay };
}

/** (o) In progress: Sam's Garage started Omar's brake job and is waiting on a caliper he approved. */
async function omarBrakes(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture & { jobDay: string }> {
  const { clock } = run;
  const omar = accounts.viewer(EMAIL.omar);
  const sam = accounts.viewer(EMAIL.sam);
  const jobDay = clock.weekdayOnOrBefore(-1);
  const fixture = await insertBookedFixture(run, {
    customer: omar,
    mechanic: sam,
    submittedAt: clock.onDate(addDaysToDate(jobDay, -3), "20:10"),
    quotedAt: clock.onDate(addDaysToDate(jobDay, -2), "08:20"),
    bookedAt: clock.onDate(addDaysToDate(jobDay, -2), "11:45"),
    request: {
      ...OMAR_WORK,
      zip: "85203",
      vehicleYear: 2015,
      vehicleMake: "Ford",
      vehicleModel: "F-150 XLT",
      mileage: 118_450,
      categoryId: "brake_work",
      description:
        "Grinding from the front left when braking and the truck pulls left under hard braking. It started after a long towing trip. I can drop it off at a shop near my work in Mesa.",
      drivable: true,
      preferredDate: jobDay,
      preferredWindow: "afternoon",
      serviceMode: "garage",
      maxGarageDistanceMiles: 15,
    },
    photos: [{ scene: "wheel-worn", fileName: "f150-front-left-wheel.jpg" }],
    quote: {
      laborCents: 18_000,
      partsIncluded: true,
      parts: [
        { description: "Front brake pads, severe-duty ceramic", quantity: 1, unitPriceCents: 7_499 },
        { description: "Front brake rotors", quantity: 2, unitPriceCents: 6_899 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 1_725 }],
      fees: [{ description: "Shop supplies", amountCents: 1_200 }],
      earliestStartLocal: clock.localInput(jobDay, "13:00"),
      durationMinutes: 240,
      serviceMode: "garage",
      scope:
        "Inspect the front brakes and calipers, replace the front pads and rotors, flush the hardware and road test. We send photos of anything we find before doing extra work.",
      exclusions: "Calipers and brake lines, if the inspection finds them damaged: quoted separately.",
      notes: "Drop-off at 1 PM. If we need a part we'll keep the truck overnight in our locked lot.",
      validityHours: 48,
    },
  });
  await startJob(run.ctxAt(clock.onDate(jobDay, "13:04")), sam, fixture.bookingId);
  const caliper = await proposeChangeOrder(run.ctxAt(clock.onDate(jobDay, "14:35")), sam, {
    bookingId: fixture.bookingId,
    description: "Replace the seized front-left caliper and bleed the brakes",
    reason:
      "The front-left caliper piston is seized, which is why the pads wore unevenly and the truck pulls. New pads would wear out the same way. The caliper arrives tomorrow morning.",
    laborCents: 9_000,
    partsCents: 11_850,
    taxCents: 960,
  });
  await decideChangeOrder(run.ctxAt(clock.onDate(jobDay, "14:52")), omar, {
    changeOrderId: caliper.changeOrderId,
    decision: "approve",
    note: "Please go ahead, thanks for the photos.",
  });
  return { ...fixture, jobDay };
}

/** (p) Two weeks ago: Elena serviced Grace's Lexus at home; Grace left a review. */
async function graceService(run: SeedRun, accounts: SeedAccounts): Promise<BookedFixture & { jobDay: string }> {
  const { clock } = run;
  const grace = accounts.viewer(EMAIL.grace);
  const elena = accounts.viewer(EMAIL.elena);
  const jobDay = clock.weekdayOnOrBefore(-13);
  const fixture = await insertBookedFixture(run, {
    customer: grace,
    mechanic: elena,
    submittedAt: clock.onDate(addDaysToDate(jobDay, -4), "21:15"),
    quotedAt: clock.onDate(addDaysToDate(jobDay, -3), "07:40"),
    bookedAt: clock.onDate(addDaysToDate(jobDay, -3), "09:05"),
    request: {
      ...GRACE_HOME,
      zip: "85018",
      vehicleYear: 2016,
      vehicleMake: "Lexus",
      vehicleModel: "RX 350",
      mileage: 87_410,
      categoryId: "basic_maintenance",
      description:
        "The maintenance light is on. I'd like a tire rotation, fluid top-offs and a look at the brakes before a road trip to San Diego.",
      drivable: true,
      preferredDate: jobDay,
      preferredWindow: "morning",
      serviceMode: "mobile",
    },
    photos: [{ scene: "driveway-ready", fileName: "rx350-driveway.jpg" }],
    quote: {
      laborCents: 9_500,
      partsIncluded: true,
      parts: [
        { description: "Coolant, 50/50 premix (1 gal)", quantity: 1, unitPriceCents: 1_899 },
        { description: "Brake fluid, DOT 3 (12 oz)", quantity: 1, unitPriceCents: 699 },
      ],
      taxes: [{ description: "Sales tax on parts (8.1%)", amountCents: 210 }],
      fees: [],
      earliestStartLocal: clock.localInput(jobDay, "08:30"),
      durationMinutes: 120,
      serviceMode: "mobile",
      scope:
        "Rotate the tires and set the pressures, top off coolant, brake and washer fluid, inspect brakes, belts and hoses, and reset the maintenance light.",
      exclusions: "Filters, wipers and any repairs the inspection finds: I'll quote them separately.",
      notes: null,
      validityHours: 72,
    },
  });
  await startJob(run.ctxAt(clock.onDate(jobDay, "08:34")), elena, fixture.bookingId);
  await completeJob(run.ctxAt(clock.onDate(jobDay, "10:41")), elena, fixture.bookingId);
  await issueInvoice(run.ctxAt(clock.onDate(jobDay, "10:55")), elena, {
    bookingId: fixture.bookingId,
    notes: "Front pads at 6 mm, rears at 5 mm: fine for the trip. The serpentine belt shows light cracking; plan to replace it within 10,000 miles.",
  });
  await submitReview(run.ctxAt(clock.onDate(addDaysToDate(jobDay, 1), "19:30")), grace, {
    bookingId: fixture.bookingId,
    rating: 4,
    comment: "Elena was on time and explained everything with photos. It took a little longer than planned, but the price matched the quote exactly.",
  });
  return { ...fixture, jobDay };
}

export async function seedBookedScenarios(run: SeedRun, accounts: SeedAccounts): Promise<BookedScenarios> {
  const scenarios = {
    graceService: await graceService(run, accounts),
    hannahBattery: await hannahBattery(run, accounts),
    completedReviewed: await completedReviewed(run, accounts),
    completedInvoiced: await completedInvoiced(run, accounts),
    omarBrakes: await omarBrakes(run, accounts),
    confirmedBooking: await confirmedBooking(run, accounts),
  };
  run.log(
    "Sample bookings (no online payment taken): Dana's confirmed job tomorrow with a change order to approve, " +
      "her completed and invoiced jobs, Omar's truck in progress, and completed jobs for Hannah and Grace.",
  );
  return scenarios;
}
