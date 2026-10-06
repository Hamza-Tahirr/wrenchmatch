import { CirclePause, CirclePlay, Hourglass, LifeBuoy, ShieldAlert, ShieldX, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/cn";
import type { JobEligibility, JobEligibilityReason } from "@/server/mechanic/eligibility";

import { setAcceptingJobsAction } from "../profile/actions";
import { HudLabel } from "./hud";
import { TAP_WITHIN } from "./tap";
import { ToastInlineAction } from "./toast-actions";

// Short titles: the eligibility message under them is a full sentence that stands on its own.
const COPY: Readonly<Record<JobEligibilityReason, { tone: "info" | "warning" | "danger"; title: string; icon: ReactNode }>> = {
  no_profile: { tone: "info", title: "Apply to start receiving jobs", icon: <UserPlus /> },
  pending_review: { tone: "info", title: "Pending admin review", icon: <Hourglass /> },
  rejected: { tone: "danger", title: "Application not approved", icon: <ShieldX /> },
  suspended: { tone: "danger", title: "Account suspended", icon: <ShieldX /> },
  insurance_expired: { tone: "danger", title: "Insurance needs updating", icon: <ShieldAlert /> },
  not_accepting: { tone: "warning", title: "New jobs are paused", icon: <CirclePause /> },
};

const TONES = {
  info: { ring: "border-neon-cyan/40", icon: "text-neon-cyan", tile: "bg-neon-cyan/10 ring-neon-cyan/40", scan: "via-neon-cyan/15", label: "cyan" as const },
  warning: { ring: "border-warning-600/45", icon: "text-warning-600", tile: "bg-warning-600/10 ring-warning-600/40", scan: "via-warning-600/12", label: "muted" as const },
  danger: { ring: "border-danger-600/45", icon: "text-danger-600", tile: "bg-danger-600/10 ring-danger-600/40", scan: "via-danger-600/12", label: "muted" as const },
};

function actionsFor(reason: JobEligibilityReason) {
  switch (reason) {
    case "no_profile":
      return <ButtonLink href="/mechanic/apply">Start your application</ButtonLink>;
    case "pending_review":
      return (
        <ButtonLink href="/mechanic/profile" variant="secondary">
          View your application
        </ButtonLink>
      );
    case "rejected":
      return <ButtonLink href="/mechanic/profile">Update and resubmit</ButtonLink>;
    case "suspended":
      return (
        <>
          <ButtonLink href="/mechanic/profile" variant="secondary">
            View your profile
          </ButtonLink>
          <ButtonLink href="/support" variant="ghost" leadingIcon={<LifeBuoy />}>
            Contact support
          </ButtonLink>
        </>
      );
    case "insurance_expired":
      return <ButtonLink href="/mechanic/profile?edit=details#profile-details">Update your insurance</ButtonLink>;
    case "not_accepting":
      return (
        <ToastInlineAction
          action={setAcceptingJobsAction}
          hiddenFields={{ acceptingJobs: "true" }}
          icon={<CirclePlay />}
          pendingText="Resuming…"
          successToast={{ title: "You're accepting new jobs again", description: "New matches appear on your board as they come in." }}
        >
          Resume new jobs
        </ToastInlineAction>
      );
  }
}

/**
 * Why the mechanic doesn't receive job matches right now, with the next step: a glass banner
 * with a slow scanning light (CSS only; static under reduced motion).
 */
export function EligibilityCallout({ eligibility, className }: { eligibility: JobEligibility; className?: string }) {
  if (eligibility.canReceiveJobs) return null;
  const copy = COPY[eligibility.reason];
  const tone = TONES[copy.tone];
  return (
    <section
      aria-labelledby="eligibility-title"
      className={cn("glass relative isolate overflow-hidden rounded-2xl border p-4 sm:p-6", "animate-slide-down", tone.ring, className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-transparent to-transparent",
          "motion-safe:animate-[wm-shimmer_6s_linear_infinite]",
          tone.scan,
        )}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span aria-hidden="true" className="relative grid size-12 shrink-0 place-items-center">
          <span className={cn("absolute inset-0 rounded-2xl ring-1", tone.tile)} />
          <span className={cn("absolute -inset-1 rounded-[1.1rem] opacity-60 ring-1 motion-safe:animate-glow-pulse", tone.tile)} />
          <span className={cn("relative [&_svg]:size-6", tone.icon)}>{copy.icon}</span>
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <HudLabel tone={tone.label}>Job matching status</HudLabel>
          <h2 id="eligibility-title" className="font-display text-lg font-semibold tracking-tight text-fg sm:text-xl">
            {copy.title}
          </h2>
          <p className="max-w-3xl text-sm text-pretty text-fg-muted sm:text-base">{eligibility.message}</p>
          <div className={cn("flex flex-wrap gap-2 pt-2", TAP_WITHIN)}>{actionsFor(eligibility.reason)}</div>
        </div>
      </div>
    </section>
  );
}
