"use client";

import { MailCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  INITIAL_ADMIN_ACTION_STATE,
  INVITE_NAME_MAX_LENGTH,
  INVITE_NOTE_MAX_LENGTH,
} from "@/lib/validation/admin";

import { useAdminToast } from "../../_components/toast";
import { TAP_TARGET } from "../../_lib/ui";
import type { InviteMechanicState } from "../actions";

const LABELS = { email: "Email", name: "Name", note: "Personal note" };

/** "Invite a mechanic": an email captured in the local outbox with a link to mechanic signup. */
export function InviteMechanicDialog({
  action,
}: {
  action: (state: InviteMechanicState, formData: FormData) => Promise<InviteMechanicState>;
}) {
  return (
    <Dialog
      trigger="Invite a mechanic"
      triggerVariant="primary"
      triggerIcon={<UserPlus />}
      triggerClassName={TAP_TARGET}
      title="Invite a mechanic"
      description="The invitation, with a link to the mechanic sign-up page, is captured in the local email outbox. It is not sent."
    >
      <InviteFlow action={action} />
    </Dialog>
  );
}

function InviteFlow({ action }: { action: (state: InviteMechanicState, formData: FormData) => Promise<InviteMechanicState> }) {
  // A new key remounts the form for "Invite another" (clearing its state and fields).
  const [round, setRound] = useState(0);
  return <InviteForm key={round} action={action} onInviteAnother={() => setRound((value) => value + 1)} />;
}

function InviteForm({
  action,
  onInviteAnother,
}: {
  action: (state: InviteMechanicState, formData: FormData) => Promise<InviteMechanicState>;
  onInviteAnother: () => void;
}) {
  const [state, dispatch] = useActionState<InviteMechanicState, FormData>(action, INITIAL_ADMIN_ACTION_STATE);
  const showToast = useAdminToast();

  useEffect(() => {
    if (state.ok) showToast(state.message);
  }, [state, showToast]);

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Invitation captured" icon={<MailCheck />}>
          <p>
            The invitation to <strong className="font-semibold text-fg">{state.toEmail}</strong> is in the local email
            outbox. It was not sent.
            {state.previouslyInvited ? " This address had been invited before." : ""}
          </p>
          <p>
            <Link href={`/admin/mailbox/${state.emailId}`}>Open the captured email</Link>
          </p>
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onInviteAnother} className={TAP_TARGET}>
            Invite another
          </Button>
          <DialogClose variant="primary" data-autofocus className={TAP_TARGET}>
            Done
          </DialogClose>
        </div>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const repeated = Object.values(errors).flat().includes(state.formError ?? "");
  return (
    <form action={dispatch} noValidate className="space-y-4">
      <FormErrorSummary
        formError={repeated ? null : state.formError}
        fieldErrors={errors}
        labels={LABELS}
        focusKey={state}
      />
      <Field label="Email" name="email" error={errors.email} required hint="They sign up with this address.">
        <Input type="email" autoComplete="off" defaultValue={values.email ?? ""} data-autofocus />
      </Field>
      <Field label="Name" name="name" error={errors.name} optional hint="Used in the greeting.">
        <Input autoComplete="off" maxLength={INVITE_NAME_MAX_LENGTH} defaultValue={values.name ?? ""} />
      </Field>
      <Field
        label="Personal note"
        name="note"
        error={errors.note}
        optional
        hint="Added to the email and kept as the reason in the audit log."
      >
        <Textarea rows={3} maxLength={INVITE_NOTE_MAX_LENGTH} defaultValue={values.note ?? ""} />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <DialogClose className={TAP_TARGET}>Cancel</DialogClose>
        <SubmitButton pendingText="Creating invitation…" className={TAP_TARGET}>
          Create invitation
        </SubmitButton>
      </div>
    </form>
  );
}
