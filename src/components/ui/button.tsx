import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Press feedback (scale), glow on hover, a light sweep across filled buttons. Transform,
// shadow and color transitions only; reduced motion makes them instant.
const base =
  "group/button relative isolate inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-xl text-center font-semibold leading-tight transition-[transform,box-shadow,background-color,color,filter] duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:scale-100 aria-busy:cursor-progress [&_svg]:shrink-0";

// A white sweep reads on the bright (dark theme) and deep (light theme) fills alike.
const sweep =
  "before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:-z-10 before:w-1/2 before:-skew-x-12 before:bg-linear-to-r before:from-transparent before:via-[oklch(1_0_0/0.35)] before:to-transparent before:opacity-0 before:transition-[transform,opacity] before:duration-700 hover:before:translate-x-[300%] hover:before:opacity-100";

const variants: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-linear-to-r from-neon-cyan via-brand-500 to-neon-blue text-on-brand shadow-glow-sm hover:shadow-glow hover:brightness-110 active:brightness-95",
    sweep,
  ),
  // Light theme: a crisp white button with a hairline and a soft shadow.
  secondary:
    "bg-fg/[0.06] text-fg ring-1 ring-line-strong ring-inset backdrop-blur-md hover:bg-fg/10 hover:shadow-glow-sm hover:ring-neon-cyan/50 active:bg-fg/[0.14] light:bg-surface/90 light:shadow-[0_1px_2px_0_oklch(0.3_0.04_262/0.08)] light:hover:bg-surface light:active:bg-surface-2",
  ghost: "text-fg-muted hover:bg-fg/[0.08] hover:text-fg active:bg-fg/[0.12]",
  danger: cn(
    "bg-linear-to-r from-danger-500 to-danger-600 text-on-brand shadow-glow-danger hover:brightness-110 active:brightness-95",
    sweep,
  ),
};

// 44px tall on phones (touch targets), the compact heights from `sm` up.
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-1.5 text-sm sm:min-h-9 [&_svg]:size-4",
  md: "min-h-11 px-4 py-2 text-sm sm:min-h-10 [&_svg]:size-4",
  lg: "min-h-12 px-6 py-3 text-base [&_svg]:size-5",
};

export type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width (handy for stacked mobile actions). */
  fullWidth?: boolean;
};

/** Class names for anything that should look like a button (links, summary elements...). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleProps & { className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export type ButtonIconProps = {
  /** An icon element such as `<Plus />`, rendered before the label. */
  leadingIcon?: ReactNode;
  /** An icon element rendered after the label. */
  trailingIcon?: ReactNode;
};

/** Shared inner layout of Button, ButtonLink and SubmitButton. */
export function ButtonContent({
  loading = false,
  leadingIcon,
  trailingIcon,
  children,
}: ButtonIconProps & { loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {loading ? <Spinner size="sm" /> : leadingIcon}
      {children}
      {loading ? null : trailingIcon ? (
        <span className="inline-flex transition-transform duration-200 group-hover/button:translate-x-0.5">{trailingIcon}</span>
      ) : null}
    </>
  );
}

export type ButtonProps = ComponentProps<"button"> &
  ButtonStyleProps &
  ButtonIconProps & {
    /** Shows a spinner, sets aria-busy and disables the button. */
    loading?: boolean;
    /** Label shown while loading (defaults to the normal label). */
    loadingText?: ReactNode;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingText,
  leadingIcon,
  trailingIcon,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      <ButtonContent loading={loading} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {loading && loadingText ? loadingText : children}
      </ButtonContent>
    </button>
  );
}
