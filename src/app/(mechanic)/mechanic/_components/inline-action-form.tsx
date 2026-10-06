"use client";

import { useActionState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/lib/validation/mechanic";

import { TAP } from "./tap";

export type InlineActionFormProps = {
  /** Server Action run when the button is pressed. */
  action: (formData: FormData) => Promise<ActionResult>;
  hiddenFields?: Readonly<Record<string, string>>;
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
  /** Accessible name when the visible label is ambiguous (e.g. repeated buttons). */
  ariaLabel?: string;
  /** Layout of the form. */
  className?: string;
};

/**
 * A single-button form for a one-click action that shows the refusal message, if any. The
 * button is at least 44 px tall on phones.
 */
export function InlineActionForm({
  action,
  hiddenFields = {},
  children,
  pendingText,
  variant,
  size,
  icon,
  fullWidth,
  ariaLabel,
  className,
}: InlineActionFormProps) {
  const [state, dispatch] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );
  return (
    <form action={dispatch} className={cn("space-y-3", className)}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        leadingIcon={icon}
        pendingText={pendingText}
        aria-label={ariaLabel}
        className={TAP}
      >
        {children}
      </SubmitButton>
      {state && !state.ok ? <Alert tone="danger">{state.formError}</Alert> : null}
    </form>
  );
}
