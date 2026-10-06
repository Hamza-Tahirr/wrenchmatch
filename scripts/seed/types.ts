// Types shared by the sample-data seed (scripts/seed.ts) and its modules. Type-only: importing
// this file loads no server code, so scripts/seed.ts can import it before script-runtime runs.
import type { Kysely } from "kysely";

import type { UserRole } from "@/lib/domain";
import type { AppContext, Viewer } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";
import type { FileStorage } from "@/server/storage/types";

import type { SeedClock } from "./clock";

export type SeedOptions = {
  /** Database to seed; it must be migrated and empty. Default: the app database (DATABASE_PATH). */
  db?: Kysely<DB>;
  /** Where uploaded files go. Default: local storage under UPLOAD_DIR. */
  storage?: FileStorage;
  /** The seeding instant; every sample date is relative to it. Default: the real clock. */
  now?: Date;
  /** Progress messages. Default: console.log. */
  log?: (message: string) => void;
};

/** The sample request scenarios (docs/DEMO_DATA.md, letters a-r). */
export type RequestScenario =
  | "brakeQuotes"
  | "noStart"
  | "pendingReservation"
  | "confirmedBooking"
  | "completedInvoiced"
  | "completedReviewed"
  | "luisGlendale"
  | "luisNoMatch"
  | "ninaHeadlight"
  | "omarWipers"
  | "graceFilters"
  | "benMisfire"
  | "hannahBattery"
  | "omarBrakes"
  | "graceService"
  | "benExpired"
  | "ninaCancelled";

export type BookingScenario =
  | "pendingReservation"
  | "confirmedBooking"
  | "completedInvoiced"
  | "completedReviewed"
  | "hannahBattery"
  | "omarBrakes"
  | "graceService";

export type SupportScenario = "danaOpen" | "omarOpen" | "kenjiResolved" | "hannahResolved";

export type SeedSummary = {
  /** The seeding instant (UTC ISO). */
  seededAt: string;
  timeZone: string;
  accounts: { email: string; role: UserRole; id: string }[];
  requests: Record<RequestScenario, string>;
  bookings: Record<BookingScenario, string>;
  /** Dana's open help request about tomorrow's booking (scenario i). */
  supportRequestId: string;
  supportRequests: Record<SupportScenario, string>;
  pictures: { avatars: number; galleryPhotos: number; bookingPhotos: number };
};

/** Sample accounts by email (DEMO_ACCOUNTS in src/server/auth/demo-accounts.ts plus the supporting cast). */
export type SeedAccounts = {
  viewer(email: string): Viewer;
  all(): Viewer[];
};

/** What every seed step works with. */
export type SeedRun = {
  db: Kysely<DB>;
  storage: FileStorage;
  clock: SeedClock;
  log: (message: string) => void;
  /** An AppContext at a past instant, for domain commands. Throws for a future instant. */
  ctxAt(at: Date): AppContext;
  /** Throws unless `at` is before the seeding instant: the seed never invents future events. */
  assertPast(at: Date, what: string): void;
};
