import { MessageSquareQuote } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { CustomerBookingDetail } from "@/server/customer/booking-views";

import { Panel } from "../../../_components/facts";
import { ratingText, Stars } from "../../../_components/stars";
import { ReviewForm } from "./review-form";

/** The review of a completed booking: the form until one is left, then the review itself. */
export function ReviewSection({ booking }: { booking: CustomerBookingDetail }) {
  const name = booking.mechanic.displayName;
  const review = booking.review;

  return (
    <Panel
      as="section"
      title={review ? "Your review" : `Review ${name}`}
      titleId="review-title"
      eyebrow="Feedback"
      description={review ? `Left ${formatDateTime(review.createdAt, booking.timeZone)}` : "One review per completed booking."}
      actions={<MessageSquareQuote aria-hidden="true" className="size-5 text-neon-cyan" />}
      bodyClassName="space-y-3"
    >
      <div id="review" className="scroll-mt-40 space-y-3">
        {review ? (
          <>
            <div className="flex items-center gap-3">
              <Stars rating={review.rating} size="lg" />
              <span className="font-mono text-sm font-medium text-fg tabular">{ratingText(review.rating)}</span>
            </div>
            {review.comment ? (
              <blockquote className="rounded-2xl border-l-2 border-warning-500/70 bg-surface-2/50 px-4 py-3 text-pretty whitespace-pre-line text-fg">
                &ldquo;{review.comment}&rdquo;
              </blockquote>
            ) : (
              <p className="text-sm text-fg-muted">No comment.</p>
            )}
            <p className="text-sm text-fg-muted">
              {review.countsTowardRating
                ? `It counts toward ${name}'s rating.`
                : `Saved with this booking. It isn't counted in ${name}'s public rating: only reviews of jobs paid online count, and online payments are coming soon.`}
            </p>
          </>
        ) : booking.canReview ? (
          <ReviewForm bookingId={booking.id} mechanicName={name} countsTowardRating={!booking.isDemoFixture} />
        ) : (
          <p className="text-sm text-fg-muted">You can leave a review once the work is completed.</p>
        )}
      </div>
    </Panel>
  );
}
