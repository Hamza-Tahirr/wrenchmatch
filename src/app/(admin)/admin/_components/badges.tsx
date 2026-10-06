import type { ReactNode } from "react";

import {
  BOOKING_STATUS_INFO,
  CHANGE_ORDER_STATUS_INFO,
  DOCUMENT_STATUS_INFO,
  JOB_MATCH_STATUS_INFO,
  MECHANIC_STATUS_INFO,
  PAYOUT_STATUS_INFO,
  QUOTE_STATUS_INFO,
  REQUEST_STATUS_INFO,
  type BookingStatus,
  type ChangeOrderStatus,
  type DocumentStatus,
  type JobMatchStatus,
  type MechanicStatus,
  type PayoutStatus,
  type QuoteStatus,
  type RequestStatus,
  type StatusInfo,
} from "@/lib/domain";
import { cn } from "@/lib/cn";
import { SUPPORT_STATUS_INFO, type SupportStatus } from "@/lib/validation/support";
import type { InsuranceStanding } from "@/server/admin/insurance";

// Status labels for the admin console: neon chips that always carry text (never color
// alone), with a glowing dot. Tones follow docs/UI.md: pending → warning, approved/
// confirmed/completed → success, rejected/suspended → danger or neutral, open → info.

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

const chipTones: Record<ChipTone, { chip: string; dot: string }> = {
  neutral: { chip: "border-line-strong bg-surface-2/80 text-fg-muted", dot: "bg-fg-subtle" },
  info: {
    chip: "border-brand-300/60 bg-brand-50/80 text-brand-800",
    dot: "bg-neon-cyan shadow-[0_0_8px_var(--color-neon-cyan)]",
  },
  success: {
    chip: "border-success-300/60 bg-success-50/80 text-success-800",
    dot: "bg-success-500 shadow-[0_0_8px_var(--color-success-500)]",
  },
  warning: {
    chip: "border-warning-300/60 bg-warning-50/80 text-warning-800",
    dot: "bg-warning-500 shadow-[0_0_8px_var(--color-warning-500)]",
  },
  danger: {
    chip: "border-danger-300/60 bg-danger-50/80 text-danger-800",
    dot: "bg-danger-500 shadow-[0_0_8px_var(--color-danger-500)]",
  },
  violet: {
    chip: "border-neon-violet/40 bg-neon-violet/10 text-fg",
    dot: "bg-neon-violet shadow-[0_0_8px_var(--color-neon-violet)]",
  },
};

type NeonChipProps = {
  tone?: ChipTone;
  /** A lucide icon element instead of the dot. */
  icon?: ReactNode;
  /** Pulse the dot (live or urgent states). */
  pulse?: boolean;
  /** Screen-reader context before the label, e.g. "Insurance: ". */
  srPrefix?: string;
  className?: string;
  children: ReactNode;
};

/** A status chip: text plus a glowing dot (or icon) in a tone. */
export function NeonChip({ tone = "neutral", icon, pulse = false, srPrefix, className, children }: NeonChipProps) {
  const styles = chipTones[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-[0.8rem] border px-2.5 py-0.5 text-xs leading-5 font-medium",
        styles.chip,
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="-ml-0.5 [&_svg]:size-3.5">
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
          {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", styles.dot)} /> : null}
          <span className={cn("relative size-1.5 rounded-full", styles.dot)} />
        </span>
      )}
      {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
      {/* Long labels (dates) wrap rather than being cut off. */}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function toneOf(info: StatusInfo): ChipTone {
  return info.tone;
}

export function StatusBadge({ info, className, pulse }: { info: StatusInfo; className?: string; pulse?: boolean }) {
  // Status names are short: keep each on one line (table columns would otherwise squeeze
  // "Waiting for quotes" into a word per line).
  return (
    <NeonChip tone={toneOf(info)} className={cn("whitespace-nowrap", className)} pulse={pulse}>
      {info.label}
    </NeonChip>
  );
}

export function MechanicStatusBadge({ status }: { status: MechanicStatus }) {
  return <StatusBadge info={MECHANIC_STATUS_INFO[status]} pulse={status === "applied" || status === "under_review"} />;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <StatusBadge info={REQUEST_STATUS_INFO[status]} />;
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <StatusBadge info={QUOTE_STATUS_INFO[status]} />;
}

/** `labelled` reads "Booking completed" for places where the badge sits next to other statuses. */
export function BookingStatusBadge({ status, labelled = false }: { status: BookingStatus; labelled?: boolean }) {
  const info = BOOKING_STATUS_INFO[status];
  return <StatusBadge info={labelled ? { ...info, label: `Booking ${info.label.toLowerCase()}` } : info} />;
}

/**
 * Payout labels for the admin console. No money moves until online payments launch; the
 * booking panels say so next to the chip.
 */
const PAYOUT_LABELS: Readonly<Record<PayoutStatus, string>> = {
  not_eligible: "Not eligible",
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  held: "On hold",
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  return <StatusBadge info={{ ...PAYOUT_STATUS_INFO[status], label: PAYOUT_LABELS[status] }} />;
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <StatusBadge info={DOCUMENT_STATUS_INFO[status]} pulse={status === "pending"} />;
}

export function ChangeOrderStatusBadge({ status }: { status: ChangeOrderStatus }) {
  return <StatusBadge info={CHANGE_ORDER_STATUS_INFO[status]} />;
}

export function JobMatchStatusBadge({ status }: { status: JobMatchStatus }) {
  return <StatusBadge info={JOB_MATCH_STATUS_INFO[status]} />;
}

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <StatusBadge info={SUPPORT_STATUS_INFO[status]} pulse={status === "open"} />;
}

/** "Valid until Oct 5, 2027", "Expires Oct 20, 2026 (in 15 days)", "Expired ...", "Not recorded". */
export function InsuranceBadge({ insurance }: { insurance: InsuranceStanding }) {
  return (
    <NeonChip tone={insurance.tone} srPrefix="Insurance: ">
      {insurance.label}
    </NeonChip>
  );
}
