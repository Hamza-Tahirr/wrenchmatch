"use client";

import { Star } from "lucide-react";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { Field } from "@/components/ui/field";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { REVIEW_COMMENT_MAX_LENGTH } from "@/lib/validation/booking";

import { useVersionedActionState } from "../../../_components/use-versioned-action-state";
import { submitReviewAction } from "../actions";
import { INITIAL_REVIEW_STATE, type ReviewFormState } from "../review-form-state";
import { StarRatingInput } from "./star-rating-input";

// Toasts fire here rather than from an effect: once the review is saved the page re-renders
// with it and this form unmounts in the same update, so an effect would never run.
async function submitReviewWithToast(previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const next = await submitReviewAction(previous, formData);
  if (next.ok) {
    toast.success("Review posted", { description: "Thanks! It now appears on this booking." });
  } else {
    toast.error("Your review wasn't sent", { description: next.formError ?? "Check the highlighted fields." });
  }
  return next;
}

/** One review per completed booking: a 1-5 star rating and an optional comment. */
export function ReviewForm({
  bookingId,
  mechanicName,
  countsTowardRating,
}: {
  bookingId: string;
  mechanicName: string;
  /** False for bookings without an online payment (all of them until payments launch). */
  countsTowardRating: boolean;
}) {
  const [state, dispatch, version] = useVersionedActionState(submitReviewWithToast, INITIAL_REVIEW_STATE);
  const rating = Number.parseInt(state.values.rating ?? "", 10);

  return (
    <PresenceSwap swapKey={state.ok ? "done" : "form"} variant="scale">
      {state.ok ? (
        <div role="status" className="flex items-center gap-4 rounded-2xl border border-success-500/30 bg-success-500/[0.08] p-4">
          <AnimatedCheck size={48} tone="success" />
          <div>
            <p className="font-semibold text-success-900">Thanks for your review</p>
            <p className="text-sm text-fg-muted">It now appears on this booking.</p>
          </div>
        </div>
      ) : (
        <form key={version} action={dispatch} noValidate className="space-y-5">
          <input type="hidden" name="bookingId" value={bookingId} />
          <FormErrorSummary
            title="Your review wasn't sent"
            formError={state.formError}
            fieldErrors={state.fieldErrors}
            labels={{ rating: "Rating", comment: "Comment" }}
            focusKey={version}
          />
          <StarRatingInput
            name="rating"
            legend={`How was your experience with ${mechanicName}?`}
            defaultValue={Number.isInteger(rating) ? rating : undefined}
            error={state.fieldErrors.rating}
          />
          <Field
            label="Comment"
            name="comment"
            optional
            hint="What went well, and what could be better? Shown with the mechanic's reviews, without your name."
            error={state.fieldErrors.comment}
          >
            <Textarea rows={4} maxLength={REVIEW_COMMENT_MAX_LENGTH} defaultValue={state.values.comment} />
          </Field>
          {countsTowardRating ? null : (
            <p className="text-sm text-fg-muted">
              Your review is saved with this booking. Only reviews of jobs paid online count toward a mechanic&rsquo;s
              public rating, and online payments are coming soon.
            </p>
          )}
          <SubmitButton leadingIcon={<Star />} pendingText="Sending review…">
            Submit review
          </SubmitButton>
        </form>
      )}
    </PresenceSwap>
  );
}
