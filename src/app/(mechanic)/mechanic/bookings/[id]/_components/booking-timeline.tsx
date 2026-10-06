import { Ban, CalendarCheck, Check, CreditCard, Flag, Play, Receipt, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { HudLabel } from "../../../_components/hud";

// The booking's journey as a neon timeline: what happened (with times in the job's zone),
// where it stands now and what comes next. Horizontal from md, vertical on phones; the
// progress line grows in on arrival (CSS only, static under reduced motion).

type StepState = "done" | "current" | "upcoming" | "stopped";

type Step = { key: string; label: string; icon: ReactNode; state: StepState; time?: string | null; note?: string };

function stepsFor(booking: MyBookingDetail): Step[] {
  const at = (iso: string | null | undefined) => (iso ? formatDateTime(iso, booking.timeZone) : null);
  const reserved: Step = { key: "reserved", label: "Reserved", icon: <CalendarCheck />, state: "done", time: at(booking.createdAt) };
  const invoiced = booking.invoice !== null;

  if (booking.status === "pending_payment") {
    return [
      reserved,
      { key: "payment", label: "Customer payment", icon: <CreditCard />, state: "current", note: "Online payments are coming soon" },
      { key: "confirmed", label: "Confirmed", icon: <Check />, state: "upcoming" },
      { key: "started", label: "In progress", icon: <Play />, state: "upcoming" },
      { key: "completed", label: "Completed", icon: <Flag />, state: "upcoming" },
      { key: "invoiced", label: "Invoiced", icon: <Receipt />, state: "upcoming" },
    ];
  }

  const confirmed: Step = {
    key: "confirmed",
    label: "Confirmed",
    icon: <Check />,
    state: booking.confirmedAt || booking.isDemoFixture ? "done" : "upcoming",
    time: at(booking.confirmedAt),
  };
  const started: Step = { key: "started", label: "In progress", icon: <Play />, state: booking.startedAt ? "done" : "upcoming", time: at(booking.startedAt) };
  const completed: Step = { key: "completed", label: "Completed", icon: <Flag />, state: booking.completedAt ? "done" : "upcoming", time: at(booking.completedAt) };
  const invoice: Step = { key: "invoiced", label: "Invoiced", icon: <Receipt />, state: invoiced ? "done" : "upcoming", time: at(booking.invoice?.issuedAt) };

  if (booking.status === "cancelled") {
    const reached = [confirmed, started, completed].filter((step) => step.state === "done");
    return [reserved, ...reached, { key: "cancelled", label: "Cancelled", icon: <Ban />, state: "stopped", time: at(booking.cancelledAt) }];
  }
  if (booking.status === "disputed") {
    const reached = [confirmed, started, completed, invoice].filter((step) => step.state === "done");
    return [reserved, ...reached, { key: "disputed", label: "Disputed", icon: <TriangleAlert />, state: "stopped", note: "An admin is reviewing it" }];
  }

  // Confirmed, in progress or completed: the latest step reached is where the job stands now
  // (all steps are done once the invoice is issued).
  const steps = [reserved, confirmed, started, completed, invoice];
  const reachedIndex = steps.reduce((last, step, index) => (step.state === "done" ? index : last), 0);
  if (reachedIndex < steps.length - 1) steps[reachedIndex].state = "current";
  return steps;
}

const NODE: Readonly<Record<StepState, string>> = {
  done: "bg-success-600 text-on-brand shadow-glow-success ring-success-600/50",
  current: "bg-neon-cyan text-on-brand shadow-glow ring-neon-cyan/60",
  upcoming: "bg-surface-2 text-fg-subtle ring-line-strong",
  stopped: "bg-danger-600 text-on-brand shadow-glow-danger ring-danger-600/50",
};

const STATE_TEXT: Readonly<Record<StepState, string>> = {
  done: "done",
  current: "current step",
  upcoming: "not yet",
  stopped: "stopped here",
};

export function BookingTimeline({ booking }: { booking: MyBookingDetail }) {
  const steps = stepsFor(booking);
  const lastReached = steps.reduce((index, step, position) => (step.state === "upcoming" ? index : position), 0);
  const fraction = steps.length > 1 ? lastReached / (steps.length - 1) : 0;
  const stopped = steps.some((step) => step.state === "stopped");
  return (
    <section aria-labelledby="timeline-title" className="glass-lite relative overflow-hidden rounded-2xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="timeline-title" className="font-display text-lg font-semibold tracking-tight text-fg">
          Job progress
        </h2>
        <HudLabel tone="muted">
          Step {lastReached + 1} of {steps.length}
        </HudLabel>
      </div>
      <div className="relative" style={{ ["--steps" as string]: steps.length }}>
        {/* Horizontal rail (md and up), from the first node's center to the last one's. */}
        <div aria-hidden="true" className="absolute top-5 right-[calc(50%/var(--steps))] left-[calc(50%/var(--steps))] hidden h-0.5 md:block">
          <span className="absolute inset-0 rounded-full bg-line-strong" />
          <span
            className={cn(
              "absolute inset-0 origin-left animate-[wm-tab-in_1.1s_var(--ease-out-expo)_both] rounded-full bg-gradient-to-r",
              stopped ? "from-success-600 to-danger-600" : "from-success-600 via-neon-cyan to-neon-cyan",
            )}
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
        {/* Vertical rail (phones), through the centers of the smaller phone nodes. */}
        <div aria-hidden="true" className="absolute top-4 bottom-4 left-4 w-0.5 -translate-x-1/2 md:hidden">
          <span className="absolute inset-0 rounded-full bg-line-strong" />
          <span
            className={cn("absolute inset-0 origin-top animate-fade-in rounded-full bg-gradient-to-b", stopped ? "from-success-600 to-danger-600" : "from-success-600 to-neon-cyan")}
            style={{ transform: `scaleY(${fraction})` }}
          />
        </div>
        <ol className="stagger-children relative grid gap-3.5 md:grid-cols-[repeat(var(--steps),minmax(0,1fr))] md:gap-0">
          {steps.map((step) => (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex items-start gap-3.5 md:flex-col md:items-center md:gap-3 md:text-center"
            >
              <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center md:size-10">
                {step.state === "current" ? (
                  <span className="absolute inset-0 rounded-full bg-neon-cyan/40 motion-safe:animate-pulse-ring" />
                ) : null}
                <span
                  className={cn(
                    "relative grid size-8 place-items-center rounded-full ring-2 [&_svg]:size-4 md:size-10 md:[&_svg]:size-[1.1rem]",
                    NODE[step.state],
                  )}
                >
                  {step.icon}
                </span>
              </span>
              <div className="min-w-0 pt-1 md:pt-0">
                <p className={cn("text-sm font-semibold", step.state === "upcoming" ? "text-fg-subtle" : "text-fg")}>
                  {step.label}
                  <span className="sr-only">: {STATE_TEXT[step.state]}</span>
                </p>
                {step.time ? <p className="mt-0.5 text-xs text-fg-muted">{step.time}</p> : null}
                {step.note ? <p className="mt-0.5 text-xs text-fg-muted">{step.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
