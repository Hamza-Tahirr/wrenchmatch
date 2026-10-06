"use client";

import { LockOpen, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { Alert, Callout } from "@/components/ui/alert";
import { DescriptionList, type DescriptionItem } from "@/components/ui/description-list";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { ADMIN_REASON_MAX_LENGTH, INITIAL_ADMIN_ACTION_STATE, type AdminRevealState } from "@/lib/validation/admin";
import type { MechanicPrivateDetails } from "@/server/admin/mechanic-private";
import type { RequestContactDetails } from "@/server/admin/requests";

import { TAP_TARGET } from "../_lib/ui";
import { useAdminToast } from "./toast";

// "Reveal" dialogs for private data. The admin gives a reason, the server records the
// reveal in the audit log and returns the details, which are shown once inside the dialog:
// they live only in this dialog's state and are discarded when it closes.

type RevealAction<T> = (state: AdminRevealState<T>, formData: FormData) => Promise<AdminRevealState<T>>;

type RevealDialogProps<T extends { revealedAt: string }> = {
  trigger: string;
  title: string;
  description: ReactNode;
  action: RevealAction<T>;
  hiddenFields: Readonly<Record<string, string>>;
  reasonHint: string;
  timeZone: string;
  details: (revealed: T) => DescriptionItem[];
};

function RevealDialog<T extends { revealedAt: string }>({
  trigger,
  title,
  description,
  ...formProps
}: RevealDialogProps<T>) {
  return (
    <Dialog
      trigger={trigger}
      triggerVariant="secondary"
      triggerSize="sm"
      triggerIcon={<LockOpen />}
      triggerClassName={TAP_TARGET}
      title={title}
      description={description}
      size="md"
    >
      <RevealForm {...formProps} />
    </Dialog>
  );
}

function RevealForm<T extends { revealedAt: string }>({
  action,
  hiddenFields,
  reasonHint,
  timeZone,
  details,
}: Pick<RevealDialogProps<T>, "action" | "hiddenFields" | "reasonHint" | "timeZone" | "details">) {
  const [state, dispatch] = useActionState<AdminRevealState<T>, FormData>(action, INITIAL_ADMIN_ACTION_STATE);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const showToast = useAdminToast();
  const failure = state.ok ? null : state;

  useEffect(() => {
    if (failure?.formError) reasonRef.current?.focus();
  }, [failure]);

  useEffect(() => {
    if (state.ok) showToast("Reveal recorded in the audit log", { tone: "info", description: "The details show once, in this dialog." });
  }, [state, showToast]);

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Callout tone="info" icon={<ShieldCheck />} title="Recorded in the audit log">
          Revealed {formatDateTime(state.revealed.revealedAt, timeZone)} with your reason. These details are not kept on
          the page: closing this dialog hides them again.
        </Callout>
        <DescriptionList items={details(state.revealed)} />
        <div className="flex justify-end pt-2">
          <DialogClose variant="primary" data-autofocus className={TAP_TARGET}>
            Done
          </DialogClose>
        </div>
      </div>
    );
  }

  const reasonError = failure?.fieldErrors?.reason;
  const otherError = failure?.formError && !(reasonError ?? []).includes(failure.formError) ? failure.formError : null;
  return (
    <form action={dispatch} noValidate className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {otherError ? <Alert tone="danger">{otherError}</Alert> : null}
      <Field label="Why do you need these details?" name="reason" hint={reasonHint} error={reasonError} required>
        <Textarea
          ref={reasonRef}
          rows={3}
          maxLength={ADMIN_REASON_MAX_LENGTH}
          defaultValue={failure?.values?.reason ?? ""}
          data-autofocus
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <DialogClose className={TAP_TARGET}>Cancel</DialogClose>
        <SubmitButton leadingIcon={<LockOpen />} pendingText="Revealing…" className={TAP_TARGET}>
          Reveal and record
        </SubmitButton>
      </div>
    </form>
  );
}

const missing = <span className="text-fg-subtle">Not on file</span>;

function link(href: string, text: string) {
  return (
    <a href={href} className="font-medium text-brand-700 underline underline-offset-2">
      {text}
    </a>
  );
}

export function MechanicRevealDialog({
  mechanicId,
  displayName,
  timeZone,
  action,
}: {
  mechanicId: string;
  displayName: string;
  timeZone: string;
  action: RevealAction<MechanicPrivateDetails>;
}) {
  return (
    <RevealDialog<MechanicPrivateDetails>
      trigger="Reveal private details"
      title={`Reveal ${displayName}'s private details?`}
      description="Legal and business name, phone, contact email, garage address and insurance policy number. Each reveal is recorded in the audit log with your reason."
      action={action}
      hiddenFields={{ mechanicId }}
      reasonHint="For example: verifying the insurance certificate against the policy number. At least 3 characters."
      timeZone={timeZone}
      details={(revealed) => {
        const garage = revealed.garageAddress;
        const garageText = garage
          ? [garage.line1, [garage.city, garage.state].filter(Boolean).join(", "), garage.zip].filter(Boolean).join(" · ")
          : null;
        return [
          { term: "Legal name", description: revealed.legalName },
          { term: "Business name", description: revealed.businessName ?? missing },
          { term: "Phone", description: link(`tel:${revealed.phone}`, revealed.phone) },
          { term: "Contact email", description: link(`mailto:${revealed.contactEmail}`, revealed.contactEmail) },
          { term: "Garage address", description: garageText ?? <span className="text-fg-subtle">None on file (no garage)</span> },
          { term: "Insurance policy number", description: revealed.insurancePolicyNumber ?? missing },
        ];
      }}
    />
  );
}

export function RequestRevealDialog({
  requestId,
  timeZone,
  action,
}: {
  requestId: string;
  timeZone: string;
  action: RevealAction<RequestContactDetails>;
}) {
  return (
    <RevealDialog<RequestContactDetails>
      trigger="Reveal contact details"
      title="Reveal the customer's contact details?"
      description="Contact email, phone, exact address and location notes. Mechanics never see these before a confirmed booking; each admin reveal is recorded in the audit log with your reason."
      action={action}
      hiddenFields={{ requestId }}
      reasonHint="For example: following up on a help request about this repair. At least 3 characters."
      timeZone={timeZone}
      details={(revealed) => [
        { term: "Contact email", description: link(`mailto:${revealed.contactEmail}`, revealed.contactEmail) },
        { term: "Phone", description: link(`tel:${revealed.contactPhone}`, revealed.contactPhone) },
        { term: "Street address", description: revealed.streetAddress ?? missing },
        {
          term: "City, state, ZIP",
          description: [[revealed.city, revealed.state].filter(Boolean).join(", "), revealed.zip]
            .filter(Boolean)
            .join(" "),
        },
        { term: "Location notes", description: revealed.locationNotes ?? missing },
      ]}
    />
  );
}
