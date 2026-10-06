import "server-only";

import type { BadgeTone } from "@/lib/domain";
import { formatDate, pluralize } from "@/lib/format";
import { INSURANCE_WARNING_DAYS } from "@/lib/validation/admin";

// A mechanic's insurance as the admin sees it. "Today" is the mechanic's local date (their
// base ZIP's time zone), the same rule matching and approval use: a policy is valid through
// its expiry date.

export type InsuranceState = "missing" | "expired" | "expiring_soon" | "valid";

export type InsuranceStanding = {
  state: InsuranceState;
  provider: string | null;
  /** YYYY-MM-DD, or null when not recorded. */
  expiresOn: string | null;
  /** Days from the mechanic's today to the expiry date: 0 = expires today, negative = expired. */
  daysUntilExpiry: number | null;
  /** e.g. "Expired Sep 30, 2026", "Expires Oct 20, 2026 (in 15 days)", "Valid until Oct 5, 2027". */
  label: string;
  tone: BadgeTone;
};

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** Whole days from calendar date `from` to `to` (both YYYY-MM-DD). */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function insuranceStanding(input: {
  provider: string | null;
  expiresOn: string | null;
  /** The mechanic's local date, YYYY-MM-DD. */
  today: string;
  warningDays?: number;
}): InsuranceStanding {
  const provider = input.provider?.trim() ? input.provider.trim() : null;
  const { expiresOn } = input;
  if (!provider || !expiresOn) {
    return {
      state: "missing",
      provider,
      expiresOn,
      daysUntilExpiry: null,
      label: provider ? "Expiry date not recorded" : "Not recorded",
      tone: "danger",
    };
  }

  const days = daysBetweenDates(input.today, expiresOn);
  const shown = formatDate(expiresOn);
  if (days < 0) {
    return { state: "expired", provider, expiresOn, daysUntilExpiry: days, label: `Expired ${shown}`, tone: "danger" };
  }
  if (days <= (input.warningDays ?? INSURANCE_WARNING_DAYS)) {
    const when = days === 0 ? "today" : `in ${pluralize(days, "day")}`;
    return { state: "expiring_soon", provider, expiresOn, daysUntilExpiry: days, label: `Expires ${shown} (${when})`, tone: "warning" };
  }
  return { state: "valid", provider, expiresOn, daysUntilExpiry: days, label: `Valid until ${shown}`, tone: "success" };
}
