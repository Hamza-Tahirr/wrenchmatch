import { ClipboardList, Hourglass, LifeBuoy, RotateCcw, ShieldX } from "lucide-react";

import { Callout } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/format";
import type { MyMechanicProfile } from "@/server/mechanic/profile";

import { resubmitApplicationAction } from "../actions";

/** Where the application stands and what the mechanic can do about it. */
export function StatusPanel({ profile }: { profile: MyMechanicProfile }) {
  const { eligibility, checklist } = profile;
  switch (profile.status) {
    case "applied":
    case "under_review":
      return (
        <Callout tone="info" icon={<Hourglass />} title="Pending admin review - you'll receive job matches after approval">
          <p>
            {profile.submittedAt ? `Submitted ${formatDate(profile.submittedAt, profile.baseArea.timeZone)}. ` : null}
            An admin is checking your details and documents, and you&rsquo;ll get a notification when it&rsquo;s decided.
            You can keep your profile up to date while you wait.
          </p>
        </Callout>
      );
    case "approved": {
      // Expired insurance has its own warning below, so the approval note doesn't repeat it.
      const insuranceBlocked = eligibility.reason === "insurance_expired";
      return (
        <Callout
          tone={eligibility.canReceiveJobs || insuranceBlocked ? "success" : "warning"}
          title={`Approved${profile.approvedAt ? ` on ${formatDate(profile.approvedAt, profile.baseArea.timeZone)}` : ""}`}
          actions={
            <ButtonLink href="/mechanic/jobs" variant="secondary" size="sm" leadingIcon={<ClipboardList />}>
              Open your job board
            </ButtonLink>
          }
        >
          <p>
            {insuranceBlocked
              ? "Your approval is still valid. Jobs resume once your renewed insurance is on file."
              : eligibility.message}
          </p>
        </Callout>
      );
    }
    case "rejected": {
      const missing = checklist.items.filter((item) => !item.done);
      return (
        <Callout
          tone="danger"
          icon={<ShieldX />}
          title="Your application wasn't approved"
          actions={
            profile.canResubmit && checklist.complete ? (
              <ConfirmDialog
                trigger="Resubmit for review"
                triggerVariant="primary"
                triggerIcon={<RotateCcw />}
                title="Resubmit your application?"
                description="An admin reviews your updated profile and documents again. You'll be notified of the decision."
                confirmLabel="Resubmit"
                pendingLabel="Resubmitting…"
                action={resubmitApplicationAction}
              />
            ) : null
          }
        >
          {profile.statusReason ? (
            <p>
              <span className="font-semibold text-danger-900">Admin&rsquo;s reason:</span> {profile.statusReason}
            </p>
          ) : null}
          <p>
            Update the details the admin mentioned below and upload any missing documents, then resubmit your
            application for review.
          </p>
          {missing.length > 0 ? (
            <div>
              <p className="font-medium text-danger-900">Still needed before you can resubmit:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {missing.map((item) => (
                  <li key={item.key}>
                    {item.label}: {item.hint}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Callout>
      );
    }
    case "suspended":
      return (
        <Callout
          tone="danger"
          icon={<ShieldX />}
          title="Your account is suspended"
          actions={
            <ButtonLink href="/support" variant="secondary" size="sm" leadingIcon={<LifeBuoy />}>
              Contact support
            </ButtonLink>
          }
        >
          {profile.statusReason ? (
            <p>
              <span className="font-semibold text-danger-900">Admin&rsquo;s reason:</span> {profile.statusReason}
            </p>
          ) : null}
          <p>
            You don&rsquo;t receive new jobs and job details are hidden. You can still finish and invoice a job that is
            already in progress. If you think this is a mistake, contact support.
          </p>
        </Callout>
      );
  }
}

/** Expired, missing or soon-expiring insurance, with a link to update it. */
export function InsuranceWarning({ profile }: { profile: MyMechanicProfile }) {
  const warning = profile.insurance.warning;
  if (!warning) return null;
  const titles = {
    missing: "No insurance on file",
    expired: "Your insurance has expired",
    expiring_soon: "Your insurance expires soon",
  } as const;
  return (
    <Callout
      tone={warning.kind === "expiring_soon" ? "warning" : "danger"}
      title={titles[warning.kind]}
      actions={
        <ButtonLink href="/mechanic/profile?edit=details#profile-details" size="sm">
          Update insurance
        </ButtonLink>
      }
    >
      <p>{warning.message}</p>
    </Callout>
  );
}
