import "server-only";

import type { MechanicStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { isValidDateString } from "@/lib/time";

// Whether a mechanic can receive and quote jobs, and insurance warnings. Pure functions:
// the caller passes "today" (YYYY-MM-DD) in the relevant time zone.

export const INSURANCE_WARNING_DAYS = 30;

export type JobEligibilityReason =
  | "no_profile"
  | "pending_review"
  | "rejected"
  | "suspended"
  | "insurance_expired"
  | "not_accepting";

export type JobEligibility =
  | { canReceiveJobs: true; reason?: undefined; message: string }
  | { canReceiveJobs: false; reason: JobEligibilityReason; message: string };

export type EligibilityInput = {
  status: MechanicStatus;
  statusReason: string | null;
  acceptingJobs: boolean;
  insuranceProvider: string | null;
  insuranceExpiresOn: string | null;
};

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  if (!isValidDateString(from) || !isValidDateString(to)) throw new RangeError(`Expected dates, received ${from} / ${to}`);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Insurance is on file and valid through every given date (a policy is valid through its expiry day). */
export function insuranceCovers(
  insurance: Pick<EligibilityInput, "insuranceProvider" | "insuranceExpiresOn">,
  ...dates: string[]
): boolean {
  const expiresOn = insurance.insuranceExpiresOn;
  if (!insurance.insuranceProvider?.trim() || !expiresOn) return false;
  return dates.every((date) => expiresOn >= date);
}

function withReason(text: string, reason: string | null): string {
  return reason?.trim() ? `${text} Reason: ${reason.trim()}` : text;
}

/** The job-board gate: approved, insured through today and accepting jobs. */
export function jobEligibility(mechanic: EligibilityInput | null, todayLocal: string): JobEligibility {
  if (!mechanic) {
    return {
      canReceiveJobs: false,
      reason: "no_profile",
      message: "Complete your mechanic application to start receiving matched jobs.",
    };
  }
  switch (mechanic.status) {
    case "applied":
    case "under_review":
      return {
        canReceiveJobs: false,
        reason: "pending_review",
        message: "Your application is waiting for admin review. You'll receive matched jobs once it's approved.",
      };
    case "rejected":
      return {
        canReceiveJobs: false,
        reason: "rejected",
        message: withReason(
          "Your application wasn't approved, so you don't receive jobs. Update your profile and resubmit when you're ready.",
          mechanic.statusReason,
        ),
      };
    case "suspended":
      return {
        canReceiveJobs: false,
        reason: "suspended",
        message: withReason(
          "Your account is suspended, so you don't receive new jobs and job details are hidden. Contact support if you think this is a mistake.",
          mechanic.statusReason,
        ),
      };
    case "approved":
      break;
  }
  if (!insuranceCovers(mechanic, todayLocal)) {
    return {
      canReceiveJobs: false,
      reason: "insurance_expired",
      message: mechanic.insuranceExpiresOn
        ? `Your insurance expired on ${formatDate(mechanic.insuranceExpiresOn)}. Add your renewed insurance on your profile to receive jobs again.`
        : "Add your insurance details on your profile to receive jobs.",
    };
  }
  if (!mechanic.acceptingJobs) {
    return {
      canReceiveJobs: false,
      reason: "not_accepting",
      message: "You've paused new jobs. Turn on Accepting jobs on your profile to see matched jobs again.",
    };
  }
  return { canReceiveJobs: true, message: "You're approved and receiving matched jobs." };
}

export type InsuranceWarning = {
  kind: "missing" | "expired" | "expiring_soon";
  expiresOn: string | null;
  /** Days until expiry (0 = expires today); negative once expired; null when missing. */
  daysLeft: number | null;
  message: string;
};

/** A warning when insurance is missing, expired or expires within INSURANCE_WARNING_DAYS. */
export function insuranceWarning(
  insurance: Pick<EligibilityInput, "insuranceProvider" | "insuranceExpiresOn">,
  todayLocal: string,
): InsuranceWarning | null {
  const expiresOn = insurance.insuranceExpiresOn;
  if (!insurance.insuranceProvider?.trim() || !expiresOn) {
    return {
      kind: "missing",
      expiresOn: expiresOn ?? null,
      daysLeft: null,
      message: "No insurance on file. Add your provider, policy number and expiry date to receive jobs.",
    };
  }
  const daysLeft = daysBetween(todayLocal, expiresOn);
  if (daysLeft < 0) {
    return {
      kind: "expired",
      expiresOn,
      daysLeft,
      message: `Your insurance expired on ${formatDate(expiresOn)}. You won't receive jobs until you add renewed insurance.`,
    };
  }
  if (daysLeft <= INSURANCE_WARNING_DAYS) {
    const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    return {
      kind: "expiring_soon",
      expiresOn,
      daysLeft,
      message: `Your insurance expires ${when} (${formatDate(expiresOn)}). Add your renewed policy before then to keep receiving jobs.`,
    };
  }
  return null;
}
