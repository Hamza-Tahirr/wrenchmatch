"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { Alert } from "@/components/ui/alert";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { INITIAL_ADMIN_ACTION_STATE, type AdminActionState } from "@/lib/validation/admin";

import { TAP_TARGET } from "../_lib/ui";
import type { AdminFormAction } from "./action-dialog";
import { useAdminToast } from "./toast";

export type InlineActionProps = {
  action: AdminFormAction;
  hiddenFields?: Readonly<Record<string, string>>;
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Accessible name when the visible label repeats on the page (e.g. one button per row). */
  ariaLabel?: string;
  /**
   * Every result is a toast. "inline" also keeps the confirmation under the button (it stays
   * mounted after the refresh); "toast" for buttons that may disappear once the action succeeds.
   */
  result?: "inline" | "toast";
  className?: string;
  /** Layout classes for the button itself (e.g. full width on phones). */
  buttonClassName?: string;
};

/** A one-click admin command (no confirmation) that reports its result. */
export function InlineAction({
  action,
  hiddenFields = {},
  children,
  pendingText,
  variant = "secondary",
  size = "sm",
  icon,
  ariaLabel,
  result = "inline",
  className,
  buttonClassName,
}: InlineActionProps) {
  const showToast = useAdminToast();
  const [state, dispatch] = useActionState<AdminActionState, FormData>(action, INITIAL_ADMIN_ACTION_STATE);
  const initial = useRef(state);

  // Successes toast; a refusal is shown (and announced) by the inline alert below.
  useEffect(() => {
    if (state === initial.current) return;
    if (state.ok && state.message) showToast(state.message);
  }, [state, showToast]);

  return (
    <form action={dispatch} className={cn("space-y-3", className)}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        leadingIcon={icon}
        pendingText={pendingText}
        aria-label={ariaLabel}
        className={cn(TAP_TARGET, buttonClassName)}
      >
        {children}
      </SubmitButton>
      {/* The toast announces the result; this copy stays visible (not announced twice). */}
      {state.ok && state.message && result === "inline" ? (
        <p className="flex animate-slide-up items-start gap-2 text-sm text-fg-muted">
          <AnimatedCheck size={20} />
          <span>{state.message}</span>
        </p>
      ) : null}
      {!state.ok && state.formError ? <Alert tone="danger">{state.formError}</Alert> : null}
    </form>
  );
}
