import {
  Banknote,
  Camera,
  Circle,
  CircleCheck,
  CirclePause,
  CirclePlay,
  LifeBuoy,
  ListChecks,
  Power,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UserX,
  Wallet,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { ACCOUNT_DELETION_DETAILS_MAX_LENGTH } from "@/lib/validation/support";
import type { AccountDeletionRequest } from "@/server/mechanic/account-deletion";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";
import { PAYOUT_ACCOUNT_NOTICE } from "@/server/mechanic/payouts";
import type { MyMechanicProfile } from "@/server/mechanic/profile";

import { CountUp } from "../../_components/count-up";
import { LiveDot, Panel } from "../../_components/hud";
import { TAP } from "../../_components/tap";
import { ToastConfirmDialog, ToastInlineAction } from "../../_components/toast-actions";
import { requestAccountDeletionAction, setAcceptingJobsAction } from "../actions";
import { ProfilePhotoForm } from "./upload-forms";

export function PhotoCard({
  profile,
  limits,
}: {
  profile: MyMechanicProfile;
  limits: MechanicFormOptions["uploads"]["profilePhoto"];
}) {
  return (
    <Panel id="photo" title="Profile photo" icon={<Camera />} bodyClassName="space-y-4">
      <div className="flex items-center gap-4">
        <span className="rounded-full p-0.5 ring-2 ring-neon-cyan/50 shadow-glow-sm">
          <Avatar
            name={profile.displayName}
            src={profile.profilePhotoFileId ? `/api/files/${profile.profilePhotoFileId}` : null}
            size="lg"
            decorative={false}
          />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{profile.displayName}</p>
          <p className="text-sm text-fg-muted">
            {profile.profilePhotoFileId ? "Shown to customers you quote." : "No photo yet: customers see your initials."}
          </p>
        </div>
      </div>
      <ProfilePhotoForm limits={limits} />
    </Panel>
  );
}

export function AcceptingJobsCard({ profile }: { profile: MyMechanicProfile }) {
  const accepting = profile.acceptingJobs;
  // Accepting is only a preference: an account that isn't approved (or whose insurance lapsed)
  // isn't matched either way, and the status panel above says why.
  const matched = accepting && profile.eligibility.canReceiveJobs;
  let badge = <Badge tone="warning">Paused</Badge>;
  let text = "You're not matched to new requests and can't send quotes. Your existing quotes and bookings are unaffected.";
  if (matched) {
    badge = <Badge tone="success">Accepting</Badge>;
    text = "You're matched to new repair requests that fit your profile. Pause when you're too busy or away.";
  } else if (accepting) {
    badge = <Badge tone="neutral">On</Badge>;
    text = "You aren't matched to new requests right now (see your status above). With this on, matching starts as soon as your account can take jobs.";
  }
  return (
    <Panel id="accepting" title="New jobs" icon={<Power />} tone={matched ? "success" : "warning"} actions={badge} bodyClassName="space-y-4">
      <p className="flex items-start gap-2.5 text-sm text-fg-muted">
        <LiveDot tone={matched ? "success" : accepting ? "cyan" : "warning"} className="mt-1" />
        {text}
      </p>
      <ToastInlineAction
        action={setAcceptingJobsAction}
        hiddenFields={{ acceptingJobs: accepting ? "false" : "true" }}
        variant={accepting ? "secondary" : "primary"}
        icon={accepting ? <CirclePause /> : <CirclePlay />}
        pendingText={accepting ? "Pausing…" : "Resuming…"}
        fullWidth
      >
        {accepting ? "Pause new jobs" : "Resume new jobs"}
      </ToastInlineAction>
    </Panel>
  );
}

export function ChecklistCard({ profile }: { profile: MyMechanicProfile }) {
  const { checklist } = profile;
  const total = checklist.items.length;
  const fraction = total === 0 ? 0 : checklist.doneCount / total;
  return (
    <Panel
      id="checklist"
      title="Application checklist"
      icon={<ListChecks />}
      tone={checklist.complete ? "success" : "cyan"}
      actions={
        <Badge tone={checklist.complete ? "success" : "warning"}>
          <span>
            <CountUp value={checklist.doneCount} /> of {total} done
          </span>
        </Badge>
      }
      bodyClassName="space-y-4"
    >
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={checklist.doneCount}
        className="h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line"
      >
        <div
          className={cn(
            "h-full origin-left animate-[wm-tab-in_1s_var(--ease-out-expo)_both] rounded-full",
            checklist.complete ? "bg-gradient-to-r from-success-600 to-neon-cyan" : "bg-gradient-to-r from-neon-cyan to-neon-blue",
          )}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      <ul className="space-y-3">
        {checklist.items.map((item) => (
          <li key={item.key} className="flex gap-2.5 text-sm">
            {item.done ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            )}
            <div className="min-w-0">
              <p className={item.done ? "font-medium text-fg" : "font-medium text-fg-muted"}>
                {item.label}
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
              </p>
              {item.done ? null : <p className="text-fg-subtle">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SafetyCard({ profile }: { profile: MyMechanicProfile }) {
  const safety = profile.services.filter((service) => service.safetySensitive);
  return (
    <Panel id="safety" title="Safety approvals" icon={<ShieldCheck />} tone="violet" bodyClassName="space-y-3">
      {safety.length > 0 ? (
        <ul className="space-y-3">
          {safety.map((service) => (
            <li key={service.categoryId} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-fg">
                {service.safety === "approved" ? (
                  <ShieldCheck aria-hidden="true" className="size-4 text-success-600" />
                ) : (
                  <ShieldAlert aria-hidden="true" className="size-4 text-warning-600" />
                )}
                {service.name}
              </span>
              <Badge tone={service.safety === "approved" ? "success" : "warning"}>
                {service.safety === "approved" ? "Approved" : "Pending review"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">You don&rsquo;t offer brake or suspension work.</p>
      )}
      <p className="text-sm text-fg-subtle">Brake and suspension jobs reach you only after an admin approves you for that category.</p>
    </Panel>
  );
}

export function PayoutOnboardingCard({ profile }: { profile: MyMechanicProfile }) {
  return (
    <Panel id="payout-onboarding" title="Payouts" icon={<Wallet />} tone="success" actions={<Badge tone="neutral">Coming soon</Badge>} bodyClassName="space-y-3">
      <p className="text-sm font-medium text-fg">{PAYOUT_ACCOUNT_NOTICE}</p>
      <p className="text-sm text-fg-muted">{profile.payoutOnboarding.description.replace(`${PAYOUT_ACCOUNT_NOTICE} `, "")}</p>
      <Button variant="secondary" disabled leadingIcon={<Banknote />} fullWidth className={TAP}>
        Set up payouts
      </Button>
    </Panel>
  );
}

/**
 * Leaving: "Request account deletion" sends the help desk an account help request (nothing is
 * deleted automatically; the team confirms first). Once asked, the card says so instead.
 */
export function AccountCard({ deletion }: { deletion: AccountDeletionRequest | null }) {
  return (
    <Panel
      id="account"
      title="Your account"
      icon={<UserCog />}
      tone="violet"
      actions={deletion ? <Badge tone="warning">Deletion requested</Badge> : null}
      bodyClassName="space-y-3"
    >
      {deletion ? (
        <>
          <p className="text-sm text-fg-muted">
            You asked us to delete your account on {formatDate(deletion.createdAt, deletion.timeZone)}. Nothing has been deleted
            yet: our team will confirm with you first and reply on Help &amp; support.
          </p>
          <ButtonLink href="/support" variant="secondary" leadingIcon={<LifeBuoy />} fullWidth className={TAP}>
            View your request
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Leaving WrenchMatch? Ask our team to delete your account and the personal data linked to it. Nothing is deleted
            automatically: we settle open quotes and bookings and confirm with you first.
          </p>
          <ToastConfirmDialog
            trigger="Request account deletion"
            triggerVariant="secondary"
            triggerIcon={<UserX />}
            triggerClassName={`w-full ${TAP}`}
            tone="danger"
            title="Request account deletion?"
            description="We'll send this to the WrenchMatch team as a help request. Nothing is deleted right away: they'll confirm with you first, and you can keep using your account meanwhile."
            confirmLabel="Send deletion request"
            pendingLabel="Sending…"
            cancelLabel="Keep my account"
            action={requestAccountDeletionAction}
            successToast={{
              description: "Our team replies on Help & support.",
              action: { label: "View request", href: "/support" },
            }}
          >
            <Field
              label="Anything we should know?"
              name="details"
              optional
              hint="For example, why you're leaving. Please don't include card numbers or passwords."
            >
              <Textarea rows={3} maxLength={ACCOUNT_DELETION_DETAILS_MAX_LENGTH} />
            </Field>
          </ToastConfirmDialog>
        </>
      )}
    </Panel>
  );
}
