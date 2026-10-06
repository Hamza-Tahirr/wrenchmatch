"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  ButtonContent,
  buttonClasses,
  type ButtonIconProps,
  type ButtonStyleProps,
} from "./button";

export type SubmitButtonProps = Omit<ComponentProps<"button">, "type"> &
  ButtonStyleProps &
  ButtonIconProps & {
    /** Label while the enclosing form's action is running, e.g. "Sending request…". */
    pendingText?: ReactNode;
  };

/**
 * Submit button for forms with a Server Action. While the action runs it shows a
 * spinner, sets aria-busy and is disabled so the form cannot be sent twice.
 * Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  pendingText,
  className,
  disabled,
  children,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      <ButtonContent loading={pending} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {pending && pendingText ? pendingText : children}
      </ButtonContent>
    </button>
  );
}
