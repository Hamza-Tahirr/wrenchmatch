// The help desk (docs/DEMO_DATA.md i): two open requests (Dana about tomorrow's booking, Omar
// about his truck in the shop) and two the admin already answered (Kenji about payouts,
// Hannah about her invoice), all raised and resolved with the app's own commands, so the
// admins' help-desk notifications, the replies and the audit events are genuine. The admin
// also invited a mechanic by email (captured in the local mailbox, never sent).
import { inviteMechanic } from "@/server/admin/invites";
import { resolveSupportRequest } from "@/server/admin/support";
import { createSupportRequest } from "@/server/support/requests";

import { EMAIL } from "../accounts";
import type { BookedScenarios } from "./booked";
import type { SeedAccounts, SeedRun } from "../types";

export type SupportScenarios = { danaOpen: string; omarOpen: string; kenjiResolved: string; hannahResolved: string };

export async function seedSupportRequests(run: SeedRun, accounts: SeedAccounts, booked: BookedScenarios): Promise<SupportScenarios> {
  const { clock } = run;
  const admin = accounts.viewer(EMAIL.admin);

  const kenji = await createSupportRequest(run.ctxAt(clock.at(-6, "10:05")), accounts.viewer(EMAIL.kenji), {
    topic: "account",
    message:
      "Two customers asked whether they can pay me through the app. How do payouts work, and when will I see them in my account?",
    bookingId: null,
    requestId: null,
  });
  await resolveSupportRequest(run.ctxAt(clock.at(-6, "14:30")), admin, {
    supportRequestId: kenji.supportRequestId,
    resolutionNote:
      "Online payments and payouts are coming soon. Nothing is charged or paid out through WrenchMatch yet, and we'll tell you in the app before that changes.",
  });

  const hannahDay = booked.hannahBattery.jobDay;
  const hannah = await createSupportRequest(run.ctxAt(clock.onDate(hannahDay, "12:10")), accounts.viewer(EMAIL.hannah), {
    topic: "booking_issue",
    message: "The invoice for my battery replacement shows a total, but I never entered a card. Do I owe anything through the app?",
    bookingId: booked.hannahBattery.bookingId,
    requestId: null,
  });
  await resolveSupportRequest(run.ctxAt(clock.onDate(hannahDay, "16:45")), admin, {
    supportRequestId: hannah.supportRequestId,
    resolutionNote:
      "No payment was taken online for this booking: online payments are coming soon, so nothing is charged through WrenchMatch yet. The invoice is your record of the work and the agreed price.",
  });

  const omar = await createSupportRequest(run.ctxAt(clock.hoursAgo(14)), accounts.viewer(EMAIL.omar), {
    topic: "booking_issue",
    message:
      "Sam's Garage found a seized caliper on my F-150 and I approved the extra work. They said the part arrives tomorrow morning. Can you confirm when the truck will be ready?",
    bookingId: booked.omarBrakes.bookingId,
    requestId: null,
  });

  const dana = await createSupportRequest(run.ctxAt(clock.minutesAgo(45)), accounts.viewer(EMAIL.dana), {
    topic: "booking_issue",
    message:
      "Question about tomorrow's booking with Marco R.: I'll be at work, so the Escape will be in my driveway with the keys in the lockbox. Is that OK? He also proposed replacing the spark plugs. Can I decide on that when he arrives instead of now?",
    bookingId: booked.confirmedBooking.bookingId,
    requestId: null,
  });

  await inviteMechanic(run.ctxAt(clock.at(-3, "16:20")), admin, {
    email: "tomas.ruiz.mobile@example.com",
    name: "Tomas R.",
    note: "Met at the Tempe parts counter. Does mobile diagnostics around Chandler and Gilbert.",
  });

  run.log("Help desk: two open requests (Dana, Omar) and two answered ones (Kenji, Hannah); one mechanic invitation in the mailbox.");
  return {
    danaOpen: dana.supportRequestId,
    omarOpen: omar.supportRequestId,
    kenjiResolved: kenji.supportRequestId,
    hannahResolved: hannah.supportRequestId,
  };
}
