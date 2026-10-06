import { ArrowRight, CircleSlash, History, Info, Send } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { formatDateTime } from "@/lib/format";
import type { JobDetail, MyQuoteDetail } from "@/server/mechanic/jobs";

import { HudLabel } from "../../../_components/hud";
import { MyQuoteCard } from "./my-quote-card";
import { QuoteForm } from "./quote-form";

/** What happened to the mechanic's latest quote when none is active any more. */
function LastQuoteNotice({ quote }: { quote: MyQuoteDetail }) {
  const amount = <Money cents={quote.totalCents} className="font-mono font-semibold text-fg" />;
  let title: string;
  let body;
  switch (quote.status) {
    case "withdrawn":
      title = "You withdrew your quote";
      body = (
        <>
          Your {amount} quote was withdrawn
          {quote.withdrawnAt ? ` on ${formatDateTime(quote.withdrawnAt, quote.timeZone)}` : ""}, and its time slot is free
          again.
        </>
      );
      break;
    case "expired":
      title = "Your last quote expired";
      body = <>Your {amount} quote expired before the customer chose one, so its time slot was released.</>;
      break;
    case "declined":
      title = "Your last quote is closed";
      body = <>The customer chose another quote or cancelled, so your {amount} quote is no longer active.</>;
      break;
    default:
      return null;
  }
  return (
    <div role="note" className="glass-lite flex gap-3 rounded-2xl p-4">
      <History aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neon-cyan" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="text-sm text-fg-muted">{body}</p>
      </div>
    </div>
  );
}

/** The mechanic's quote on this job: the active quote, the quote form, or why quoting is closed. */
export function QuoteSection({ job, justSent = false }: { job: JobDetail; justSent?: boolean }) {
  const active = job.myQuote && (job.myQuote.status === "submitted" || job.myQuote.status === "selected") ? job.myQuote : null;
  const booked = job.availability === "booked_with_you";
  const activeTitle = active?.status !== "selected" ? "Active quote" : booked ? "Accepted quote" : "Reserved quote";
  const latest = job.quoteHistory[0] ?? null;
  const earlier = job.quoteHistory.filter((quote) => quote.id !== active?.id);
  const closed = job.availability === "unavailable";
  return (
    <section aria-labelledby="job-quote-title" className="scroll-mt-28 space-y-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/30 shadow-glow-sm [&_svg]:size-5">
          <Send />
        </span>
        <div>
          <HudLabel tone="muted">Quote</HudLabel>
          <h2 id="job-quote-title" tabIndex={-1} className="font-display text-2xl font-semibold tracking-tight text-fg focus:outline-none">
            {active ? "Your quote" : job.actions.canQuote ? (earlier.length > 0 ? "Send a new quote" : "Send a quote") : "Quote"}
          </h2>
        </div>
      </div>
      {active ? (
        <MyQuoteCard quote={active} bookingId={job.myBookingId} booked={booked} title={activeTitle} highlight={justSent} />
      ) : latest ? (
        <LastQuoteNotice quote={latest} />
      ) : null}
      {job.actions.canQuote && job.quoteForm ? (
        // overflow-clip (not hidden): the send bar inside sticks to the bottom of the screen.
        <div className="glass relative overflow-clip rounded-2xl p-4 sm:p-6">
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/70 to-transparent" />
          <QuoteForm requestId={job.requestId} defaults={job.quoteForm} />
        </div>
      ) : null}
      {!active && !job.actions.canQuote && job.actions.quoteBlockedReason ? (
        <div
          role="note"
          className={
            closed
              ? "glass-lite flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-start sm:p-5"
              : "glass-lite flex flex-col gap-4 rounded-2xl border-warning-600/40 p-4 sm:flex-row sm:items-start sm:p-5"
          }
        >
          {closed ? (
            <CircleSlash aria-hidden="true" className="size-6 shrink-0 text-fg-subtle" />
          ) : (
            <Info aria-hidden="true" className="size-6 shrink-0 text-warning-600" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-fg">{closed ? "This job is closed" : "You can't quote this job right now"}</p>
            <p className="text-sm text-fg-muted">{job.actions.quoteBlockedReason}</p>
          </div>
          {closed ? (
            <ButtonLink href="/mechanic/jobs" variant="secondary" size="sm">
              Back to the job board
            </ButtonLink>
          ) : job.matchStatus === "passed" ? null : (
            <ButtonLink href="/mechanic/profile" variant="secondary" size="sm">
              Go to your profile
            </ButtonLink>
          )}
        </div>
      ) : null}
      {earlier.length > 0 ? (
        <details className="group glass-lite rounded-2xl">
          <summary className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-fg/5 sm:px-6">
            <span>
              {active ? "Earlier quotes" : "Your previous quotes"}{" "}
              <span className="font-mono font-normal text-fg-subtle">({earlier.length})</span>
            </span>
            <ArrowRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-300 group-open:rotate-90" />
          </summary>
          <div className="space-y-4 border-t border-line p-4 sm:p-6">
            {earlier.map((quote) => (
              <MyQuoteCard
                key={quote.id}
                quote={quote}
                bookingId={null}
                title={`Quote sent ${formatDateTime(quote.createdAt, quote.timeZone)}`}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
