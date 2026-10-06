"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "./alert";
import type { ButtonSize, ButtonVariant } from "./button";
import { Dialog, DialogClose, useDialog } from "./dialog";
import { SubmitButton } from "./submit-button";
import { toast } from "./toast";

/** Return `{ ok: false, formError }` to keep the dialog open and show the message. */
export type ConfirmActionResult = void | { ok: boolean; formError?: string | null; message?: string | null };

export type ConfirmDialogProps = {
  /** Label of the button that opens the dialog. */
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Server Action (or client function) called with the form data when confirmed. */
  action: (formData: FormData) => ConfirmActionResult | Promise<ConfirmActionResult>;
  /** Hidden inputs sent with the action, e.g. `{ quoteId }`. */
  hiddenFields?: Readonly<Record<string, string>>;
  confirmLabel: string;
  /** Label while the action runs, e.g. "Withdrawing…". */
  pendingLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions (red confirm button). */
  tone?: "danger" | "primary";
  /** Toast shown when the action succeeds, e.g. "Quote withdrawn" (or the result's `message`). */
  successToast?: string;
  /** Extra fields inside the form, e.g. a required reason <Field>. */
  children?: ReactNode;
};

/**
 * Asks for confirmation before running an action. Focus starts on Cancel; the confirm
 * button shows a pending state; the dialog closes when the action succeeds.
 */
export function ConfirmDialog({
  trigger,
  triggerVariant,
  triggerSize,
  triggerIcon,
  triggerClassName,
  title,
  description,
  tone = "primary",
  ...formProps
}: ConfirmDialogProps) {
  return (
    <Dialog
      trigger={trigger}
      triggerVariant={triggerVariant ?? (tone === "danger" ? "danger" : "secondary")}
      triggerSize={triggerSize}
      triggerIcon={triggerIcon}
      triggerClassName={triggerClassName}
      title={title}
      description={description}
      size="sm"
    >
      <ConfirmForm tone={tone} {...formProps} />
    </Dialog>
  );
}

type ConfirmFormProps = Pick<
  ConfirmDialogProps,
  "action" | "hiddenFields" | "confirmLabel" | "pendingLabel" | "cancelLabel" | "tone" | "successToast" | "children"
>;

function ConfirmForm({
  action,
  hiddenFields = {},
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  tone,
  successToast,
  children,
}: ConfirmFormProps) {
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  async function run(formData: FormData) {
    setError(null);
    const result = await action(formData);
    if (result && !result.ok) {
      setError(result.formError || "That didn't work. Please try again.");
      return;
    }
    const message = (result && result.message) || successToast;
    if (message) toast.success(message);
    dialog?.close();
  }

  return (
    <form action={run} className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {children}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <DialogClose data-autofocus>{cancelLabel}</DialogClose>
        <SubmitButton variant={tone === "danger" ? "danger" : "primary"} pendingText={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
