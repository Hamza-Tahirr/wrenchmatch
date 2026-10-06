import { Ban, Check, CircleCheck, CircleX, ClipboardCheck, Gavel, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MECHANIC_STATUS_INFO, type MechanicStatus } from "@/lib/domain";
import { ADMIN_REASON_MAX_LENGTH, type AdminMechanicStatus } from "@/lib/validation/admin";
import type { AdminMechanicDetail } from "@/server/admin/mechanics";

import { ActionDialog, type ActionDialogField, type AdminFormAction } from "../../../_components/action-dialog";
import { MechanicStatusBadge } from "../../../_components/badges";
import { ConsoleNote, Panel } from "../../../_components/console";
import { Timestamp } from "../../../_components/timestamp";
import { TAP_TARGET } from "../../../_lib/ui";

type StatusActionCopy = {
  trigger: string;
  /** Shorter label for the phone decision bar, where three buttons share one row. */
  barTrigger: string;
  icon: ReactNode;
  title: string;
  description: string;
  confirm: string;
  pending: string;
  tone: "primary" | "danger";
  field: ActionDialogField;
};

function optionalNote(label: string): ActionDialogField {
  return {
    name: "reason",
    label,
    optional: true,
    maxLength: ADMIN_REASON_MAX_LENGTH,
    hint: "Shown to the mechanic and kept in the audit log.",
  };
}

function requiredReason(label: string, hint: string): ActionDialogField {
  return { name: "reason", label, required: true, maxLength: ADMIN_REASON_MAX_LENGTH, hint, rows: 4 };
}

function copyFor(target: AdminMechanicStatus, from: MechanicStatus, name: string): StatusActionCopy {
  switch (target) {
    case "under_review":
      return {
        trigger: "Move to review",
        barTrigger: "Start review",
        icon: <ClipboardCheck />,
        title: `Start reviewing ${name}'s application?`,
        description: "The status changes to Under review and the mechanic is told an admin is looking at it.",
        confirm: "Move to review",
        pending: "Moving…",
        tone: "primary",
        field: optionalNote("Note to the mechanic"),
      };
    case "approved":
      return from === "suspended"
        ? {
            trigger: "Reinstate",
            barTrigger: "Reinstate",
            icon: <RotateCcw />,
            title: `Reinstate ${name}?`,
            description: "They become approved again and can receive job matches. Insurance must still be current.",
            confirm: "Reinstate mechanic",
            pending: "Reinstating…",
            tone: "primary",
            field: optionalNote("Note to the mechanic"),
          }
        : {
            trigger: "Approve",
            barTrigger: "Approve",
            icon: <CircleCheck />,
            title: `Approve ${name}?`,
            description:
              "Approved mechanics receive matching job requests. Check the documents, insurance and safety-sensitive services first.",
            confirm: "Approve mechanic",
            pending: "Approving…",
            tone: "primary",
            field: optionalNote("Note to the mechanic"),
          };
    case "rejected":
      return {
        trigger: "Reject",
        barTrigger: "Reject",
        icon: <CircleX />,
        title: `Reject ${name}'s application?`,
        description: "They can update their application and apply again. They see your reason.",
        confirm: "Reject application",
        pending: "Rejecting…",
        tone: "danger",
        field: requiredReason("Reason (shown to the mechanic)", "Say what is missing or wrong. At least 3 characters."),
      };
    case "suspended":
      return {
        trigger: "Suspend",
        barTrigger: "Suspend",
        icon: <Ban />,
        title: `Suspend ${name}?`,
        description:
          "They stop receiving new jobs immediately. Existing quotes and bookings are not changed. They see your reason.",
        confirm: "Suspend mechanic",
        pending: "Suspending…",
        tone: "danger",
        field: requiredReason("Reason (shown to the mechanic)", "At least 3 characters. You can reinstate them later."),
      };
  }
}

/** Applied or under review: an admin decision is waiting (the phone decision bar shows). */
export function awaitsDecision(mechanic: AdminMechanicDetail): boolean {
  const current = mechanic.status.current;
  return (current === "applied" || current === "under_review") && mechanic.status.allowedTransitions.length > 0;
}

type StepState = "done" | "current" | "upcoming" | "exit";

/**
 * The application path as a three-step progress line (applied → under review → approved). A
 * rejection takes the last step's place; a suspension follows approval. It fits one row on a
 * 360px phone: each step is a node with its label underneath.
 */
function StatusTrack({ current }: { current: MechanicStatus }) {
  const steps: { key: string; label: string; state: StepState }[] =
    current === "rejected"
      ? [
          { key: "applied", label: "Applied", state: "done" },
          { key: "under_review", label: "Under review", state: "done" },
          { key: "rejected", label: "Rejected", state: "exit" },
        ]
      : current === "suspended"
        ? [
            { key: "applied", label: "Applied", state: "done" },
            { key: "under_review", label: "Under review", state: "done" },
            { key: "approved", label: "Approved", state: "done" },
            { key: "suspended", label: "Suspended", state: "exit" },
          ]
        : (["applied", "under_review", "approved"] as const).map((status, index, all) => {
            const reached = all.indexOf(current);
            return {
              key: status,
              label: status === "applied" ? "Applied" : status === "under_review" ? "Under review" : "Approved",
              state: index < reached ? "done" : index === reached ? "current" : "upcoming",
            };
          });

  return (
    <ol aria-label="Application progress" className="grid auto-cols-fr grid-flow-col">
      {steps.map((step, index) => {
        const here = step.state === "current" || step.state === "exit";
        const lineDone = step.state !== "upcoming";
        return (
          <li
            key={step.key}
            aria-current={here ? "step" : undefined}
            className="relative flex min-w-0 flex-col items-center gap-2 px-1 text-center"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3.5 right-[calc(50%+1.25rem)] left-[calc(-50%+1.25rem)] h-0.5 rounded-full",
                  step.state === "exit"
                    ? "bg-gradient-to-r from-success-500/70 to-danger-500"
                    : lineDone
                      ? "bg-gradient-to-r from-success-500 to-success-400"
                      : "bg-line-strong",
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative grid size-7 place-items-center rounded-full border [&_svg]:size-3.5",
                step.state === "done" && "border-success-300/60 bg-success-50 text-success-700",
                step.state === "current" &&
                  "border-neon-cyan/60 bg-neon-cyan/15 text-neon-cyan shadow-[0_0_18px_-6px_var(--color-neon-cyan)]",
                step.state === "exit" &&
                  "border-danger-300/60 bg-danger-50 text-danger-700 shadow-[0_0_18px_-6px_var(--color-danger-500)]",
                step.state === "upcoming" && "border-line-strong bg-fg/[0.03] text-fg-subtle",
              )}
            >
              {step.state === "done" ? <Check /> : null}
              {step.state === "exit" ? <Gavel /> : null}
              {step.state === "current" ? (
                <span className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-neon-cyan opacity-70" />
                  <span className="relative size-2 rounded-full bg-neon-cyan" />
                </span>
              ) : null}
              {step.state === "upcoming" ? <span className="size-1.5 rounded-full bg-fg-subtle" /> : null}
            </span>
            <span
              className={cn(
                "text-xs leading-tight font-medium text-balance",
                step.state === "current" && "text-fg",
                step.state === "done" && "text-fg-muted",
                step.state === "exit" && "text-danger-700",
                step.state === "upcoming" && "text-fg-subtle",
              )}
            >
              {step.label}
              <span className="sr-only">
                {step.state === "done" ? " (done)" : here ? " (current)" : " (not yet)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The allowed status moves as buttons that open a reason dialog ("panel" in the panel, "bar" in the phone bar). */
function TransitionButtons({
  mechanic,
  action,
  placement,
}: {
  mechanic: AdminMechanicDetail;
  action: AdminFormAction;
  placement: "panel" | "bar";
}) {
  const { status } = mechanic;
  const name = mechanic.profile.displayName;
  const bar = placement === "bar";
  // In the bar the destructive move comes first and the main one last (under the thumb).
  const rank = (target: AdminMechanicStatus) => (copyFor(target, status.current, name).tone === "danger" ? 0 : target === "approved" ? 2 : 1);
  const targets = bar ? [...status.allowedTransitions].sort((a, b) => rank(a) - rank(b)) : status.allowedTransitions;
  return targets.map((target) => {
    const copy = copyFor(target, status.current, name);
    const label = bar ? copy.barTrigger : copy.trigger;
    if (target === "approved" && status.approvalBlockedReason) {
      return (
        <Button
          key={target}
          size="sm"
          disabled
          leadingIcon={copy.icon}
          aria-describedby="approval-blocked"
          className={cn(TAP_TARGET, bar && "min-w-0 flex-auto")}
        >
          {label}
        </Button>
      );
    }
    return (
      <ActionDialog
        key={target}
        trigger={label}
        triggerIcon={copy.icon}
        triggerVariant={copy.tone === "danger" ? "danger" : target === "approved" ? "primary" : "secondary"}
        triggerClassName={bar ? "min-w-0 flex-auto" : undefined}
        title={copy.title}
        description={copy.description}
        action={action}
        hiddenFields={{ mechanicId: mechanic.id, status: target }}
        fields={[copy.field]}
        confirmLabel={copy.confirm}
        pendingLabel={copy.pending}
        tone={copy.tone}
      />
    );
  });
}

/** The mechanic's review status, who set it and the moves allowed now (each with a reason dialog). */
export function StatusPanel({
  mechanic,
  timeZone,
  action,
}: {
  mechanic: AdminMechanicDetail;
  timeZone: string;
  action: AdminFormAction;
}) {
  const { status } = mechanic;
  // While a decision is waiting, phones and tablets get the buttons in a bar that stays at the
  // bottom of the screen (DecisionBar), so they are reachable after reading the documents.
  const pending = awaitsDecision(mechanic);
  return (
    <Panel
      id="review-decision"
      title="Review decision"
      icon={<Gavel />}
      variant="glass"
      tone="violet"
      description="Moves follow the application state machine; each one notifies the mechanic and is audited."
    >
      {/* A flex column, not space-y: the action row is display:none below lg and must not leave a gap. */}
      <div className="flex flex-col gap-5">
        <StatusTrack current={status.current} />
        <p className="text-sm text-fg-muted">
          {status.changedAt ? (
            <>
              {MECHANIC_STATUS_INFO[status.current].label} since <Timestamp iso={status.changedAt} timeZone={timeZone} />
              {status.changedBy ? ` by ${status.changedBy.displayName}` : ""}
            </>
          ) : mechanic.profile.submittedAt ? (
            <>
              Applied <Timestamp iso={mechanic.profile.submittedAt} timeZone={timeZone} />
            </>
          ) : (
            "The application has not been submitted yet."
          )}
        </p>
        {status.reason ? (
          <p className="rounded-xl border-l-2 border-neon-violet/60 bg-fg/[0.03] px-3 py-2 text-sm text-fg-muted">
            <span className="font-medium text-fg">
              {status.current === "rejected" || status.current === "suspended" ? "Reason" : "Note"}:
            </span>{" "}
            {status.reason}
          </p>
        ) : null}

        {status.approvalBlockedReason ? (
          <ConsoleNote icon={<TriangleAlert />} tone="warning" title="Approval is blocked">
            <span id="approval-blocked">{status.approvalBlockedReason}</span>
          </ConsoleNote>
        ) : null}

        {status.allowedTransitions.length > 0 ? (
          <div className={cn("flex-wrap gap-2", pending ? "hidden lg:flex" : "flex max-sm:[&>button]:flex-1")}>
            <TransitionButtons mechanic={mechanic} action={action} placement="panel" />
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">
            No admin moves from here: a rejected mechanic updates their application and applies again from their profile.
          </p>
        )}
        {pending ? <p className="sr-only lg:hidden">The decision buttons are at the end of the page.</p> : null}
      </div>
    </Panel>
  );
}

/**
 * Phones and tablets, while a decision is waiting: the review buttons in a glass bar that stays
 * at the bottom of the screen (render it last on the page). From lg the panel shows them.
 */
export function DecisionBar({ mechanic, action }: { mechanic: AdminMechanicDetail; action: AdminFormAction }) {
  if (!awaitsDecision(mechanic)) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:hidden">
      <section
        aria-label={`Review decision for ${mechanic.profile.displayName}`}
        className="glass-strong animate-slide-up rounded-t-2xl border-x-0 border-b-0 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        <p className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="min-w-0 truncate">
            Decision for <span className="font-semibold text-fg">{mechanic.profile.displayName}</span>
          </span>
          <MechanicStatusBadge status={mechanic.status.current} />
        </p>
        <div className="mt-2 flex gap-2 max-[380px]:[&_svg]:hidden">
          <TransitionButtons mechanic={mechanic} action={action} placement="bar" />
        </div>
      </section>
    </div>
  );
}
