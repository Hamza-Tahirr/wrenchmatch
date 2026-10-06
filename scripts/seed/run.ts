// Runs the sample-data seed (loaded by scripts/seed.ts after script-runtime, so server modules
// can be imported normally here). Steps run in story order; each one uses the app's domain
// commands where they exist and writes rows directly only for what no command can create
// (sample accounts, reference data, confirmed sample bookings). docs/DEMO_DATA.md describes
// the result.
import { UPLOAD_DIR } from "@/server/config";
import type { AppContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { createLocalFileStorage } from "@/server/storage/local-storage";

import { EMAIL, seedAccounts, type SampleEmail } from "./accounts";
import { SCENES, type SceneKey } from "./art/catalog";
import { createSeedClock } from "./clock";
import { finishSeed } from "./finish";
import { assertEmptyMigratedDatabase } from "./guard";
import { warmSceneCache } from "./images";
import { mechanicSignupTimes, seedMechanics } from "./mechanics";
import { loadPilotRegion, seedPilotRegion } from "./pilot-region";
import { seedBookedScenarios } from "./scenarios/booked";
import { seedMedia } from "./scenarios/media";
import { seedOpenScenarios } from "./scenarios/open";
import { seedSupportRequests } from "./scenarios/support";
import type { SeedOptions, SeedRun, SeedSummary } from "./types";

export async function runSeed(options: SeedOptions): Promise<SeedSummary> {
  const db = options.db ?? getDb();
  const storage = options.storage ?? createLocalFileStorage(UPLOAD_DIR);
  const now = new Date((options.now ?? new Date()).getTime());
  const log = options.log ?? ((message: string) => console.log(message));

  await assertEmptyMigratedDatabase(db);
  const region = loadPilotRegion();
  const clock = createSeedClock(now, region.timeZone);
  const assertPast = (at: Date, what: string) => {
    if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) {
      throw new Error(`Sample data error: ${what} would happen at ${at.toISOString()}, after the seeding time ${now.toISOString()}.`);
    }
  };
  const run: SeedRun = {
    db,
    storage,
    clock,
    log,
    assertPast,
    ctxAt(at): AppContext {
      assertPast(at, "an event");
      return { db, storage, now: new Date(at.getTime()) };
    },
  };
  log(`Seeding sample data as of ${clock.today} (${clock.timeZone}); dates are relative to now.`);

  // The photo scenes take a few seconds each to draw: render them in the background while
  // the accounts and mechanics are created.
  const warming = warmSceneCache(Object.keys(SCENES) as SceneKey[]);
  warming.catch(() => undefined);

  await seedPilotRegion(run, region);
  const signups: Record<string, Date> = {
    [EMAIL.admin]: clock.at(-420, "09:00"),
    [EMAIL.dana]: clock.at(-95, "20:15"),
    [EMAIL.luis]: clock.at(-18, "12:40"),
    [EMAIL.nina]: clock.at(-60, "21:05"),
    [EMAIL.omar]: clock.at(-40, "07:50"),
    [EMAIL.grace]: clock.at(-120, "19:30"),
    [EMAIL.ben]: clock.at(-25, "18:15"),
    [EMAIL.hannah]: clock.at(-50, "12:25"),
    ...mechanicSignupTimes(run),
  };
  const accounts = await seedAccounts(run, (email: SampleEmail) => {
    const at = signups[email];
    if (!at) throw new Error(`No sign-up time for ${email}`);
    return at;
  });
  await seedMechanics(run, accounts);
  await warming;
  const booked = await seedBookedScenarios(run, accounts);
  const open = await seedOpenScenarios(run, accounts);
  const support = await seedSupportRequests(run, accounts, booked);
  const pictures = await seedMedia(run, accounts, booked);
  await finishSeed(run);

  return {
    seededAt: now.toISOString(),
    timeZone: clock.timeZone,
    accounts: accounts.all().map((viewer) => ({ email: viewer.email, role: viewer.role, id: viewer.id })),
    requests: {
      brakeQuotes: open.brakeQuotes,
      noStart: open.noStart,
      pendingReservation: open.pendingReservation.requestId,
      confirmedBooking: booked.confirmedBooking.requestId,
      completedInvoiced: booked.completedInvoiced.requestId,
      completedReviewed: booked.completedReviewed.requestId,
      luisGlendale: open.luisGlendale,
      luisNoMatch: open.luisNoMatch,
      ninaHeadlight: open.ninaHeadlight,
      omarWipers: open.omarWipers,
      graceFilters: open.graceFilters,
      benMisfire: open.benMisfire,
      hannahBattery: booked.hannahBattery.requestId,
      omarBrakes: booked.omarBrakes.requestId,
      graceService: booked.graceService.requestId,
      benExpired: open.benExpired,
      ninaCancelled: open.ninaCancelled,
    },
    bookings: {
      pendingReservation: open.pendingReservation.bookingId,
      confirmedBooking: booked.confirmedBooking.bookingId,
      completedInvoiced: booked.completedInvoiced.bookingId,
      completedReviewed: booked.completedReviewed.bookingId,
      hannahBattery: booked.hannahBattery.bookingId,
      omarBrakes: booked.omarBrakes.bookingId,
      graceService: booked.graceService.bookingId,
    },
    supportRequestId: support.danaOpen,
    supportRequests: support,
    pictures,
  };
}
