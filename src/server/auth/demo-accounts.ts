import "server-only";

import type { UserRole } from "@/lib/domain";

// The seeded sample logins (users.is_demo_account = 1), listed on the login page when
// DEMO_MODE is on. Labels and summaries are user-facing product copy (presentation mode: no
// "demo" wording). All addresses are @example.com and
// receive no email. Every sample account uses DEMO_PASSWORD, which is documented publicly.

export const DEMO_PASSWORD = "repair-pilot-2026";

export type DemoAccountGroup = "customers" | "mechanics" | "mechanic_states" | "admin";

export type DemoAccount = {
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly group: DemoAccountGroup;
  /** One line on what the account is for. */
  readonly summary: string;
};

export const DEMO_ACCOUNT_GROUPS: ReadonlyArray<{ readonly id: DemoAccountGroup; readonly label: string }> = [
  { id: "customers", label: "Customers" },
  { id: "mechanics", label: "Approved mechanics" },
  { id: "mechanic_states", label: "Mechanics in review or paused" },
  { id: "admin", label: "Admin" },
];

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: "customer@example.com",
    displayName: "Dana",
    role: "customer",
    group: "customers",
    summary: "Customer with repair requests, quotes to compare and bookings.",
  },
  {
    email: "customer2@example.com",
    displayName: "Luis",
    role: "customer",
    group: "customers",
    summary: "A second customer whose requests stay private from Dana.",
  },
  {
    email: "mechanic@example.com",
    displayName: "Marco R.",
    role: "mechanic",
    group: "mechanics",
    summary: "Approved mechanic offering mobile and garage service.",
  },
  {
    email: "mechanic2@example.com",
    displayName: "Priya S.",
    role: "mechanic",
    group: "mechanics",
    summary: "Approved mechanic, mobile service only.",
  },
  {
    email: "garage@example.com",
    displayName: "Sam's Garage",
    role: "mechanic",
    group: "mechanics",
    summary: "Approved garage for brake and suspension work.",
  },
  {
    email: "jordan@example.com",
    displayName: "Jordan T.",
    role: "mechanic",
    group: "mechanics",
    summary: "Lists brake work but is not yet approved for it.",
  },
  {
    email: "applicant@example.com",
    displayName: "Alex K.",
    role: "mechanic",
    group: "mechanic_states",
    summary: "New mechanic application waiting for review.",
  },
  {
    email: "suspended@example.com",
    displayName: "Taylor M.",
    role: "mechanic",
    group: "mechanic_states",
    summary: "Suspended mechanic, paused from new jobs.",
  },
  {
    email: "expired@example.com",
    displayName: "Morgan L.",
    role: "mechanic",
    group: "mechanic_states",
    summary: "Approved, but insurance expired, so new jobs are paused.",
  },
  {
    email: "rejected@example.com",
    displayName: "Casey D.",
    role: "mechanic",
    group: "mechanic_states",
    summary: "Application not approved; can update and resubmit.",
  },
  {
    email: "admin@example.com",
    displayName: "Avery (Admin)",
    role: "admin",
    group: "admin",
    summary: "Reviews applications; oversees matching, requests, settings, audit log and mailbox.",
  },
];
