"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { Dialog, DialogClose, useDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { INITIAL_ADMIN_ACTION_STATE, type AdminActionState } from "@/lib/validation/admin";

import { TAP_TARGET } from "../_lib/ui";
import { useAdminToast } from "./toast";

// A button that opens a dialog around one admin command: optional explanation, text fields
// (a reason, a note) with inline errors, and a confirm button. On success the dialog closes
// and the confirmation appears as a toast; on failure it stays open with the message and the
// typed text kept.

export type ActionDialogField = {
  name: string;
  label: string;
  hint?: string;
  /** Multi-line by default. */
  kind?: "textarea" | "text";
  required?: boolean;
  /** Adds "(optional)" to the label. */
  optional?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
};

export type AdminFormAction = (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;

export type ActionDialogProps = {
  /** Label of the button that opens the dialog. */
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerIcon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action: AdminFormAction;
  hiddenFields?: Readonly<Record<string, string>>;
  fields?: readonly ActionDialogField[];
  confirmLabel: string;
  pendingLabel?: string;
  /** "danger" for destructive or restrictive actions. */
  tone?: "primary" | "danger";
  /** Shown above the fields (consequences, warnings). */
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Layout classes for the trigger button (e.g. full width on phones). */
  triggerClassName?: string;
};

export function ActionDialog({
  trigger,
  triggerVariant,
  triggerSize = "sm",
  triggerIcon,
  title,
  description,
  tone = "primary",
  size = "sm",
  triggerClassName,
  ...formProps
}: ActionDialogProps) {
  return (
    <Dialog
      trigger={trigger}
      triggerVariant={triggerVariant ?? (tone === "danger" ? "danger" : "secondary")}
      triggerSize={triggerSize}
      triggerIcon={triggerIcon}
      // Positioned, so screen-reader-only text in the label ("Disable ZIP 85004") stays inside
      // a scrolling table instead of widening the page on phones.
      triggerClassName={cn("relative", TAP_TARGET, triggerClassName)}
      title={title}
      description={description}
      size={size}
    >
      <ActionDialogForm tone={tone} {...formProps} />
    </Dialog>
  );
}

type ActionDialogFormProps = Pick<
  ActionDialogProps,
  "action" | "hiddenFields" | "fields" | "confirmLabel" | "pendingLabel" | "tone" | "children"
>;

function ActionDialogForm({
  action,
  hiddenFields = {},
  fields = [],
  confirmLabel,
  pendingLabel,
  tone,
  children,
}: ActionDialogFormProps) {
  const dialog = useDialog();
  const showToast = useAdminToast();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useActionState<AdminActionState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.ok) {
      if (result.message) showToast(result.message);
      dialog?.close();
    }
    return result;
  }, INITIAL_ADMIN_ACTION_STATE);

  const failure = state.ok ? null : state;
  const errors = failure?.fieldErrors ?? {};
  const values = failure?.values ?? {};
  const shown = new Set(fields.map((field) => field.name));
  // The overall message, unless it only repeats an error already shown under a field.
  const fieldMessages = Object.entries(errors).flatMap(([name, messages]) => (shown.has(name) ? messages : []));
  const formError =
    failure?.formError && !fieldMessages.includes(failure.formError) ? failure.formError : null;

  // After a refused submit, move focus to the first field with an error (or the message).
  useEffect(() => {
    if (!failure || (!failure.formError && !failure.fieldErrors)) return;
    const invalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    (invalid ?? alertRef.current)?.focus();
  }, [failure]);

  return (
    <form ref={formRef} action={dispatch} noValidate className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children ? <div className="space-y-3 text-sm text-fg-muted">{children}</div> : null}
      {formError ? (
        <div ref={alertRef} tabIndex={-1} className="focus:outline-none">
          <Alert tone="danger">{formError}</Alert>
        </div>
      ) : null}
      {fields.map((field, index) => {
        // Focus starts in the first field when there is something to type, otherwise on Cancel.
        const autofocus = index === 0 ? { "data-autofocus": true } : {};
        return (
          <Field
            key={field.name}
            label={field.label}
            name={field.name}
            hint={field.hint}
            error={errors[field.name]}
            required={field.required}
            optional={field.optional}
          >
            {field.kind === "text" ? (
              <Input
                {...autofocus}
                defaultValue={values[field.name] ?? ""}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
              />
            ) : (
              <Textarea
                {...autofocus}
                rows={field.rows ?? 3}
                defaultValue={values[field.name] ?? ""}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
              />
            )}
          </Field>
        );
      })}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <DialogClose className={TAP_TARGET} {...(fields.length === 0 ? { "data-autofocus": true } : {})}>
          Cancel
        </DialogClose>
        <SubmitButton variant={tone === "danger" ? "danger" : "primary"} pendingText={pendingLabel} className={TAP_TARGET}>
          {confirmLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
