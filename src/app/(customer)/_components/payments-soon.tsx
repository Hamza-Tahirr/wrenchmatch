import { CreditCard, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The honest payment boundary: online payments aren't live yet, so nothing is charged and
 * the checkout button stays disabled. No card fields, no simulated payment.
 */
export function PaymentsSoon({
  title = "Online payments are coming soon",
  children,
  checkoutLabel = "Pay securely online",
  showCheckout = true,
  id = "payments-soon",
  className,
}: {
  title?: string;
  children?: ReactNode;
  checkoutLabel?: string;
  /** The disabled checkout button (pending reservations). */
  showCheckout?: boolean;
  id?: string;
  className?: string;
}) {
  const noteId = `${id}-note`;
  return (
    <div
      className={cn(
        "relative space-y-3 overflow-hidden rounded-2xl border border-dashed border-warning-400/60 bg-linear-to-br from-warning-500/[0.09] via-transparent to-neon-violet/[0.06] p-4",
        className,
      )}
    >
      <p className="flex items-start gap-2.5 text-sm font-semibold text-warning-900">
        <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-xl bg-warning-500/15 text-warning-700 ring-1 ring-warning-500/30">
          <CreditCard className="size-4" />
          <Lock className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-canvas p-0.5 text-warning-700" />
        </span>
        <span className="pt-1.5">{title}</span>
      </p>
      {children ? <div id={noteId} className="text-sm text-pretty text-fg-muted">{children}</div> : null}
      {showCheckout ? (
        <Button disabled fullWidth variant="secondary" leadingIcon={<Lock />} aria-describedby={children ? noteId : undefined}>
          {checkoutLabel}
        </Button>
      ) : null}
    </div>
  );
}
