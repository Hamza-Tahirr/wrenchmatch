import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { container: string; icon: string; title: string; bar: string }> = {
  info: {
    container: "border-neon-cyan/25 bg-neon-cyan/[0.07]",
    icon: "text-neon-cyan drop-shadow-[0_0_8px_var(--color-neon-cyan)]",
    title: "text-brand-900",
    bar: "bg-neon-cyan shadow-[0_0_14px_var(--color-neon-cyan)]",
  },
  success: {
    container: "border-success-500/30 bg-success-500/[0.08]",
    icon: "text-success-600 drop-shadow-[0_0_8px_var(--color-success-600)]",
    title: "text-success-900",
    bar: "bg-success-600 shadow-[0_0_14px_var(--color-success-600)]",
  },
  warning: {
    container: "border-warning-500/30 bg-warning-500/[0.08]",
    icon: "text-warning-600 drop-shadow-[0_0_8px_var(--color-warning-600)]",
    title: "text-warning-900",
    bar: "bg-warning-600 shadow-[0_0_14px_var(--color-warning-600)]",
  },
  danger: {
    container: "border-danger-500/35 bg-danger-500/[0.09]",
    icon: "text-danger-600 drop-shadow-[0_0_8px_var(--color-danger-600)]",
    title: "text-danger-900",
    bar: "bg-danger-600 shadow-[0_0_14px_var(--color-danger-600)]",
  },
};

const icons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

export type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replace the tone's icon with another icon element, or pass false for none. */
  icon?: ReactNode | false;
  /** Buttons or links shown under the message. */
  actions?: ReactNode;
  id?: string;
  className?: string;
};

function AlertFrame({
  tone = "info",
  title,
  children,
  icon,
  actions,
  id,
  className,
  role,
}: AlertProps & { role?: "alert" | "status" }) {
  const style = tones[tone];
  const ToneIcon = icons[tone];
  return (
    <div
      id={id}
      role={role}
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 pl-5 backdrop-blur-sm",
        style.container,
        role ? "animate-fade-in" : undefined,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)} />
      <div className="flex gap-3">
        {icon === false ? null : (
          <span aria-hidden="true" className={cn("mt-0.5 shrink-0 [&_svg]:size-5", style.icon)}>
            {icon ?? <ToneIcon />}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1 text-sm text-fg-muted">
          {title ? <p className={cn("font-semibold", style.title)}>{title}</p> : null}
          {children ? (
            <div className="space-y-2 [&_a]:font-medium [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2">{children}</div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2 pt-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A message that appears in response to something the user did (after a submit, a failed
 * action...). It is announced: danger/warning use role="alert", info/success role="status".
 */
export function Alert(props: AlertProps) {
  const tone = props.tone ?? "info";
  return <AlertFrame {...props} role={tone === "danger" || tone === "warning" ? "alert" : "status"} />;
}

/** Static guidance that is part of the page (not announced), e.g. "Online payments are coming soon". */
export function Callout(props: AlertProps) {
  return <AlertFrame {...props} />;
}
