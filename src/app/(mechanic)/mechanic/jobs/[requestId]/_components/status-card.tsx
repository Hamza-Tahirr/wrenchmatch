import { ArrowDown, ArrowRight, Radar, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { formatDateTime } from "@/lib/format";
import type { JobDetail } from "@/server/mechanic/jobs";

import { Panel } from "../../../_components/hud";
import { JumpLink } from "@/components/ui/jump-link";
import { TAP } from "../../../_components/tap";
import { ToastConfirmDialog, ToastInlineAction } from "../../../_components/toast-actions";
import { markInterestedAction, passJobAction } from "../../actions";

/**
 * The mechanic's response to the job: write a quote (the main action, it jumps to the form
 * further down), Interested, Not interested, and links to their quote or booking.
 */
export function StatusCard({ job }: { job: JobDetail }) {
  const { actions } = job;
  const canWriteQuote = actions.canQuote && job.quoteForm !== null;
  return (
    <Panel id="job-status" title="Your response" icon={<Radar />} strong bodyClassName="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={job.availabilityTone}>{job.availabilityLabel}</Badge>
        {job.matchStatus === "interested" ? (
          <Badge tone="info" icon={<ThumbsUp />}>
            You&rsquo;re interested
          </Badge>
        ) : null}
        {job.matchStatus === "passed" ? <Badge tone="neutral">You passed</Badge> : null}
      </div>
      <dl className="space-y-2 rounded-xl border border-line bg-surface-2/50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-subtle">Matched</dt>
          <dd className="text-right text-fg">{formatDateTime(job.matchedAt, job.timeZone)}</dd>
        </div>
        {job.expiresAt ? (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-subtle">Request open until</dt>
            <dd className="text-right text-fg">{formatDateTime(job.expiresAt, job.timeZone)}</dd>
          </div>
        ) : null}
      </dl>
      {job.matchStatus === "passed" && actions.canMarkInterested ? (
        <p className="text-sm text-fg-muted">This job is hidden from your board. Changed your mind?</p>
      ) : null}
      {canWriteQuote || actions.canMarkInterested || actions.canPass ? (
        <div className="flex flex-col gap-2">
          {canWriteQuote ? (
            <JumpLink href="#job-quote-title" fullWidth trailingIcon={<ArrowDown />} className={TAP}>
              Write a quote
            </JumpLink>
          ) : null}
          {actions.canMarkInterested ? (
            <ToastInlineAction
              action={markInterestedAction}
              hiddenFields={{ requestId: job.requestId }}
              icon={<ThumbsUp />}
              variant={canWriteQuote ? "secondary" : "primary"}
              pendingText="Saving…"
              fullWidth
              successToast={{
                title: "Saved to Interested",
                description: `${job.vehicle.label} stays on your Interested tab while you prepare a quote.`,
              }}
            >
              Interested
            </ToastInlineAction>
          ) : null}
          {actions.canPass ? (
            <ToastConfirmDialog
              trigger="Not interested"
              triggerVariant={canWriteQuote ? "ghost" : "secondary"}
              triggerIcon={<ThumbsDown />}
              triggerClassName={`w-full ${TAP}`}
              title="Hide this job?"
              description="It leaves your board and you won't send a quote. While the request is open you can still find it here and mark yourself interested."
              confirmLabel="Hide job"
              pendingLabel="Hiding…"
              action={passJobAction}
              hiddenFields={{ requestId: job.requestId }}
              successToast={{ title: "Job hidden", description: "It no longer shows on your board." }}
            />
          ) : null}
        </div>
      ) : null}
      {actions.withdrawableQuoteId ? (
        <JumpLink href="#job-quote-title" variant="secondary" fullWidth className={TAP}>
          View your quote
        </JumpLink>
      ) : null}
      {job.myBookingId ? (
        <ButtonLink href={`/mechanic/bookings/${job.myBookingId}`} fullWidth trailingIcon={<ArrowRight />} className={TAP}>
          Open the booking
        </ButtonLink>
      ) : null}
    </Panel>
  );
}
