import { CalendarCheck, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Alert, Callout } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { formatDateTime, pluralize } from "@/lib/format";
import { REQUEST_TTL_DAYS } from "@/server/config";
import type { RequestDetail } from "@/server/customer/request-views";

import { CancelRequestDialog } from "./cancel-request-dialog";
import { RequestCelebration } from "./request-celebration";

/** The change most likely to reach more mechanics, from what the request asked for. */
function zeroMatchTip(request: RequestDetail): string {
  if (request.serviceMode === "mobile" && request.drivable) {
    return "Choosing “Either” for where the work happens lets garages nearby quote too.";
  }
  if (request.serviceMode !== "mobile" && request.maxGarageDistanceMiles < 25) {
    return "Allowing a longer drive to a garage (up to 25 miles) reaches more garages.";
  }
  if (request.serviceMode === "garage") {
    return "Choosing “Either” lets mobile mechanics come to you as well.";
  }
  if (request.preferredWindow !== "flexible") {
    return "A flexible time of day or another date reaches mechanics with other hours.";
  }
  return "Mechanics only travel so far: if the car can be moved closer to the metro, another ZIP code may help, or try another date.";
}

/**
 * The one message at the top of a request: the celebration right after sending (with the
 * actual number of mechanics notified), the honest zero-match state, or where the request
 * stands once it is reserved, booked, cancelled or expired.
 */
export function RequestStatusNotice({ request, justSubmitted }: { request: RequestDetail; justSubmitted: boolean }) {
  const againLink = (
    <ButtonLink href={`/request?from=${request.id}`} variant="secondary" size="sm" leadingIcon={<RefreshCw />}>
      Request again
    </ButtonLink>
  );

  if (request.awaitingAdminFollowUp) {
    const Message = justSubmitted ? Alert : Callout;
    return (
      <Message
        tone="warning"
        title="No approved mechanics are available for this request yet"
        actions={
          <>
            <ButtonLink href={`/request?from=${request.id}`} variant="secondary" leadingIcon={<RefreshCw />}>
              Change and send again
            </ButtonLink>
            <CancelRequestDialog requestId={request.id} liveQuoteCount={0} matchedCount={0} triggerVariant="ghost" />
          </>
        }
      >
        <p>
          None of our approved mechanics near {request.areaLabel} can take this {request.categoryName.toLowerCase()} request
          right now, so nobody was notified and nothing is booked.
        </p>
        <p className="font-semibold text-fg">What you can do</p>
        <ol className="list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-fg-subtle">
          <li>
            <strong className="font-semibold text-fg">Wait for our team.</strong> We&rsquo;ve alerted them, and
            you&rsquo;ll get a notification if they find a mechanic who can help.
            {request.expiresAt ? ` The request stays open until ${formatDateTime(request.expiresAt, request.timeZone)}.` : null}
          </li>
          <li>
            <strong className="font-semibold text-fg">Change the details.</strong> {zeroMatchTip(request)} &ldquo;Change
            and send again&rdquo; copies this request, so you only edit what&rsquo;s different; then cancel this one.
          </li>
          <li>
            <strong className="font-semibold text-fg">Ask us.</strong> If it&rsquo;s urgent,{" "}
            <Link href={`/support?requestId=${request.id}`}>send a help request</Link> and we&rsquo;ll reply on the help
            page.
          </li>
        </ol>
      </Message>
    );
  }

  if (justSubmitted && request.status !== "cancelled" && request.matchedCount > 0) {
    return (
      <RequestCelebration
        matchedCount={request.matchedCount}
        areaLabel={request.areaLabel}
        expiresAt={request.expiresAt}
        timeZone={request.timeZone}
      />
    );
  }

  switch (request.status) {
    case "reserved":
      return request.booking ? (
        <Callout
          tone="warning"
          title="You reserved a quote: payment pending"
          actions={
            <ButtonLink href={`/bookings/${request.booking.id}`} size="sm" leadingIcon={<CalendarCheck />}>
              View reservation
            </ButtonLink>
          }
        >
          <p>
            Online payments are coming soon, so the reservation stays pending: it isn&rsquo;t a confirmed booking yet,
            you haven&rsquo;t been charged, and contact details stay hidden.
          </p>
        </Callout>
      ) : null;
    case "booked":
      return request.booking ? (
        <Callout
          tone="success"
          title={request.booking.status === "completed" ? "Completed" : "Booked"}
          actions={
            <ButtonLink href={`/bookings/${request.booking.id}`} size="sm" leadingIcon={<CalendarCheck />}>
              View booking
            </ButtonLink>
          }
        >
          <p>
            {request.booking.status === "completed"
              ? "The work on this request is done. The booking page has the invoice and your review."
              : "Your booking is confirmed. The booking page has the mechanic's contact details and any change orders."}{" "}
            Online payments are coming soon, so nothing has been charged online.
          </p>
        </Callout>
      ) : null;
    case "cancelled":
      return (
        <Callout tone="info" title="This request is cancelled" actions={againLink}>
          <p>
            {request.booking
              ? "The reservation was cancelled, so this request closed too. You weren't charged."
              : "You cancelled it. Any open quotes were declined and the mechanics were told."}{" "}
            To get new quotes, send it again.
          </p>
        </Callout>
      );
    case "expired":
      return (
        <Callout tone="info" title="This request has expired" actions={againLink}>
          <p>
            Requests stay open for {pluralize(REQUEST_TTL_DAYS, "day")}. Send it again to get fresh quotes from mechanics
            who are available now.
          </p>
        </Callout>
      );
    default:
      return null;
  }
}
