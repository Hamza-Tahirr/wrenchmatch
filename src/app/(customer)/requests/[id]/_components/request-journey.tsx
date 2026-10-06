import { CalendarCheck, Check, CircleSlash, Inbox, Radio, Send, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import type { RequestDetail } from "@/server/customer/request-views";

import styles from "./request.module.css";

type StepState = "done" | "current" | "upcoming" | "stopped";
type JourneyStep = { key: string; label: string; detail: string | null; icon: ReactNode; state: StepState };

const CONFIRMED_LIKE = new Set(["confirmed", "in_progress", "completed", "disputed"]);

/** Where the request stands, as five milestones (or the point where it stopped). */
function journeyOf(request: RequestDetail): JourneyStep[] {
  const booking = request.booking;
  const booked = booking !== null && CONFIRMED_LIKE.has(booking.status);
  const reserved = booking !== null;
  const hasQuotes = request.quoteCount > 0;
  const matched = request.matchedCount > 0;
  const closed = request.status === "cancelled" || request.status === "expired";

  const steps: JourneyStep[] = [
    { key: "sent", label: "Sent", detail: null, icon: <Send />, state: "done" },
    {
      key: "matched",
      label: "Matched",
      detail: matched ? `${pluralize(request.matchedCount, "mechanic")} notified` : "Nobody yet",
      icon: <Radio />,
      state: matched ? "done" : closed ? "upcoming" : "current",
    },
    {
      key: "quotes",
      label: "Quotes",
      detail: hasQuotes ? pluralize(request.quoteCount, "quote") : matched && !closed ? "Waiting" : null,
      icon: <Inbox />,
      state: hasQuotes ? "done" : matched && !closed ? "current" : "upcoming",
    },
    {
      key: "reserved",
      label: "Reserved",
      detail: reserved ? (booked ? null : booking.statusLabel) : hasQuotes && !closed ? "Your choice" : null,
      icon: <CalendarCheck />,
      state: reserved ? "done" : hasQuotes && !closed ? "current" : "upcoming",
    },
    {
      key: "booked",
      label: booking?.status === "completed" ? "Completed" : "Booked",
      detail: booked ? booking.statusLabel : reserved && !closed ? "Online payments coming soon" : null,
      icon: <Sparkles />,
      state: booked ? "done" : "upcoming",
    },
  ];

  if (closed) {
    // Replace the first milestone that wasn't reached with where it stopped.
    const stopAt = steps.findIndex((step) => step.state !== "done");
    if (stopAt >= 0) {
      steps[stopAt] = {
        key: "stopped",
        label: request.status === "cancelled" ? "Cancelled" : "Expired",
        detail: null,
        icon: <CircleSlash />,
        state: "stopped",
      };
      for (let index = stopAt + 1; index < steps.length; index += 1) {
        steps[index] = { ...steps[index], state: "upcoming", detail: null };
      }
    }
  }
  return steps;
}

/** A neon progress rail across the request's milestones. */
export function RequestJourney({ request }: { request: RequestDetail }) {
  const steps = journeyOf(request);
  const reachedIndex = steps.reduce((last, step, index) => (step.state === "done" || step.state === "stopped" ? index : last), 0);
  const currentIndex = steps.findIndex((step) => step.state === "current");
  const progressIndex = Math.max(reachedIndex, currentIndex >= 0 ? currentIndex - 0.5 : reachedIndex);
  const progress = steps.length > 1 ? progressIndex / (steps.length - 1) : 1;

  return (
    <nav aria-label="Request progress" className="glass-lite rounded-3xl px-3 py-5 sm:px-6">
      <div className="relative">
        <div aria-hidden="true" className="absolute top-[1.1rem] right-[10%] left-[10%] h-px bg-line-strong">
          <div
            className={cn(
              styles.fill,
              "h-full bg-linear-to-r from-neon-cyan via-neon-blue to-neon-violet shadow-[0_0_14px_var(--color-neon-cyan)]",
            )}
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <ol className="relative grid grid-cols-5">
          {steps.map((step) => (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex min-w-0 flex-col items-center text-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid size-9 place-items-center rounded-full border [&_svg]:size-4",
                  step.state === "done" && "border-transparent bg-brand-600 text-on-brand shadow-glow-sm",
                  step.state === "current" && "border-neon-cyan/80 bg-brand-50 text-brand-900 shadow-glow",
                  step.state === "upcoming" && "border-line-strong bg-surface-2 text-fg-subtle",
                  step.state === "stopped" && "border-danger-300/60 bg-danger-50 text-danger-700",
                )}
              >
                {step.state === "done" ? <Check strokeWidth={3} /> : step.icon}
                {step.state === "current" ? (
                  <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon-cyan" />
                ) : null}
              </span>
              <span
                className={cn(
                  "mt-2 text-[11px] font-semibold tracking-wide uppercase sm:text-xs",
                  step.state === "upcoming" ? "text-fg-subtle" : step.state === "stopped" ? "text-danger-700" : "text-fg",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === "done" ? " (done)" : step.state === "current" ? " (in progress)" : step.state === "stopped" ? "" : " (not yet)"}
                </span>
              </span>
              {step.detail ? (
                <span className="mt-0.5 hidden max-w-full truncate px-1 text-xs text-fg-subtle sm:block">{step.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
