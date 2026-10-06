import { CalendarCheck, Camera, FileText, Star, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PhotoGrid } from "@/components/media/photo-grid";
import type { BookingPhotoView } from "@/components/media/media-types";
import { Money } from "@/components/ui/money";
import type { AdminRequestBooking } from "@/server/admin/requests";

import { BookingInterventions } from "../../../_components/booking-interventions";
import { BookingStatusBadge, ChangeOrderStatusBadge, NeonChip, PayoutStatusBadge } from "../../../_components/badges";
import { ConsentRecord } from "../../../_components/consent-record";
import { ConsoleNote, FactGrid, Panel } from "../../../_components/console";
import { feeRateLabel, LineItemsTable, TotalsList } from "../../../_components/money";
import { Timestamp } from "../../../_components/timestamp";
import { quoteModeLabel, slotLabel } from "../../../_lib/display";
import { TAP_TARGET } from "../../../_lib/ui";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={
            value <= rating
              ? "size-4 fill-warning-600 text-warning-600 drop-shadow-[0_0_6px_var(--color-warning-600)]"
              : "size-4 text-fg-subtle/40"
          }
        />
      ))}
    </span>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="font-display text-sm font-semibold tracking-tight text-fg">{children}</h3>;
}

/** The booking with its money, state, post-booking records, photos and admin actions. */
export function BookingSection({
  booking,
  summary,
  photos,
}: {
  booking: AdminRequestBooking;
  summary: string;
  /** Before/after photos the customer and the mechanic added (evidence for disputes). */
  photos: readonly BookingPhotoView[];
}) {
  const tz = booking.timeZone;
  const timeline = [
    { label: "Reserved", at: booking.createdAt },
    { label: "Confirmed", at: booking.confirmedAt },
    { label: "Started", at: booking.startedAt },
    { label: "Completed", at: booking.completedAt },
    { label: "Cancelled", at: booking.cancelledAt },
  ].filter((entry): entry is { label: string; at: string } => entry.at !== null);
  const pending = booking.status === "pending_payment";
  // A reservation that was never confirmed has no job records yet (and a cancelled one never will).
  const neverConfirmed = pending || (booking.status === "cancelled" && booking.confirmedAt === null);

  return (
    <Panel
      title="Booking"
      icon={<CalendarCheck />}
      tone="violet"
      variant="glass"
      description={
        pending
          ? "A reservation waiting for payment. It stays pending: online payments are coming soon, so it can't be confirmed yet."
          : "The confirmed job: no online payment was taken (online payments are coming soon)."
      }
      actions={<BookingStatusBadge status={booking.status} />}
    >
      <div className="space-y-6">
        {pending ? (
          <ConsoleNote icon={<WalletCards />} tone="warning" title="Online payments are coming soon">
            The customer accepted the quote and the consent below. Nothing was charged, and contact details stay hidden from
            both parties until a verified payment confirms the booking.
          </ConsoleNote>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-5">
            <FactGrid
              items={[
                {
                  term: "Mechanic",
                  description: (
                    <Link
                      href={`/admin/mechanics/${booking.mechanic.id}`}
                      className={`inline-flex items-center font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
                    >
                      {booking.mechanic.displayName}
                    </Link>
                  ),
                },
                { term: "Customer", description: booking.customer.displayName },
                { term: "When", description: slotLabel(booking.slotStartAt, booking.slotEndAt, tz), wide: true },
                { term: "Where", description: `${quoteModeLabel(booking.serviceMode)} · ${booking.areaLabel}`, wide: true },
                {
                  term: "Payment",
                  description: pending ? "Not taken: online payments are coming soon" : "No online payment taken",
                },
                { term: "Payout", description: <PayoutStatusBadge status={booking.payoutStatus} /> },
                ...(booking.cancelReason ? [{ term: "Cancel reason", description: booking.cancelReason, wide: true }] : []),
              ]}
            />
            <div className="space-y-2">
              <p className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Timeline</p>
              <ol className="flex flex-wrap gap-2">
                {timeline.map((entry, index) => (
                  <li
                    key={entry.label}
                    className="flex items-center gap-2 rounded-full border border-line bg-fg/[0.03] py-1 pr-3 pl-1.5 text-xs text-fg-muted"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-neon-violet/15 font-mono text-[10px] font-semibold text-fg ring-1 ring-neon-violet/40">
                      {index + 1}
                    </span>
                    <span className="font-medium text-fg">{entry.label}</span>
                    <Timestamp iso={entry.at} timeZone={tz} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <TotalsList
            currency={booking.currency}
            className="h-fit"
            rows={[
              { label: "Labor", cents: booking.laborCents },
              { label: "Parts", cents: booking.partsCents },
              { label: "Tax", cents: booking.taxCents },
              { label: "Fees", cents: booking.feeCents },
              { label: "Customer total", cents: booking.totalCents, emphasis: true },
              { label: "Platform fee", cents: booking.platformFeeCents, hint: feeRateLabel(booking.platformFeeBps) },
              { label: "Mechanic payout", cents: booking.mechanicPayoutCents, hint: "Before payment-processing costs" },
            ]}
          />
        </div>

        <div className="space-y-2 rounded-2xl border border-line bg-fg/[0.02] p-4">
          <SubHeading>Admin actions</SubHeading>
          <BookingInterventions booking={booking} summary={summary} />
        </div>

        <ConsentRecord consent={booking.bookingConsent} title="Booking consent" timeZone={tz} />

        {neverConfirmed ? (
          <p className="text-sm text-fg-subtle">
            {pending
              ? "Job photos, change orders, the invoice and the review appear here once the job is confirmed."
              : "This reservation was never confirmed, so it has no job photos, change orders, invoice or review."}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <SubHeading>
                <span className="inline-flex items-center gap-2">
                  <Camera aria-hidden="true" className="size-4 text-neon-cyan" />
                  Job photos ({photos.length})
                </span>
              </SubHeading>
              <PhotoGrid
                photos={photos}
                label="Job photos from the customer and the mechanic"
                layout="strip"
                badges={Object.fromEntries(
                  photos.map((photo) => [photo.id, `${photo.phase === "other" ? "Photo" : photo.phase === "before" ? "Before" : "After"} · ${photo.uploadedByRole}`]),
                )}
                empty={<p className="text-sm text-fg-subtle">No before or after photos yet.</p>}
              />
            </div>

            <div className="space-y-3">
              <SubHeading>Change orders ({booking.changeOrders.length})</SubHeading>
              {booking.changeOrders.length > 0 ? (
                <ul className="space-y-3">
                  {booking.changeOrders.map((order) => (
                    <li key={order.id} className="space-y-1.5 rounded-xl border border-line bg-fg/[0.02] p-3.5 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{order.description}</span>
                        <ChangeOrderStatusBadge status={order.status} />
                        <Money cents={order.amountCents} currency={order.currency} className="ml-auto font-mono font-semibold text-fg tabular" />
                      </p>
                      <p className="text-fg-muted">Why: {order.reason}</p>
                      <p className="text-xs text-fg-subtle">
                        Proposed by {order.proposedBy.displayName} <Timestamp iso={order.proposedAt} timeZone={tz} />
                        {order.decidedAt ? (
                          <>
                            {" "}
                            · decided{order.decidedBy ? ` by ${order.decidedBy.displayName}` : ""}{" "}
                            <Timestamp iso={order.decidedAt} timeZone={tz} />
                          </>
                        ) : null}
                      </p>
                      {order.decisionNote ? <p className="text-fg-muted">&ldquo;{order.decisionNote}&rdquo;</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-subtle">No change orders.</p>
              )}
            </div>

            <div className="space-y-3">
              <SubHeading>
                <span className="inline-flex items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 text-neon-violet" />
                  Invoice
                </span>
              </SubHeading>
              {booking.invoice ? (
                <div className="space-y-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                    <span className="font-mono font-medium text-fg">{booking.invoice.invoiceNumber}</span>
                    issued by {booking.invoice.issuedBy.displayName} <Timestamp iso={booking.invoice.issuedAt} timeZone={tz} />
                  </p>
                  <LineItemsTable
                    caption={`Invoice ${booking.invoice.invoiceNumber} line items`}
                    currency={booking.invoice.currency}
                    items={booking.invoice.lineItems.map((line, index) => ({
                      key: `${line.source}-${line.changeOrderId ?? "quote"}-${index}`,
                      kind: line.kind,
                      description: line.description,
                      quantity: line.quantity,
                      unitPriceCents: line.unitPriceCents,
                      amountCents: line.amountCents,
                      note: line.source === "change_order" ? "From an approved change order" : undefined,
                    }))}
                  />
                  <TotalsList
                    currency={booking.invoice.currency}
                    className="ml-auto max-w-xs"
                    rows={[
                      { label: "Invoice total", cents: booking.invoice.totalCents, emphasis: true },
                      {
                        label: "Platform fee",
                        cents: booking.invoice.platformFeeCents,
                        hint: feeRateLabel(booking.invoice.platformFeeBps),
                      },
                      { label: "Mechanic payout", cents: booking.invoice.mechanicPayoutCents },
                    ]}
                  />
                  {booking.invoice.notes ? <p className="text-sm text-fg-muted">Notes: {booking.invoice.notes}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">No invoice issued.</p>
              )}
            </div>

            <div className="space-y-2">
              <SubHeading>Review</SubHeading>
              {booking.review ? (
                <div className="space-y-1.5 rounded-xl border border-line bg-fg/[0.02] p-3.5 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <Stars rating={booking.review.rating} />
                    {booking.review.isDemoFixture ? (
                      <NeonChip tone="neutral">Sample review · not counted toward ratings</NeonChip>
                    ) : (
                      <NeonChip tone="success">Counts toward the rating</NeonChip>
                    )}
                    <span className="text-xs text-fg-subtle">
                      <Timestamp iso={booking.review.createdAt} timeZone={tz} format="date" />
                    </span>
                  </p>
                  {booking.review.comment ? <p className="text-fg-muted">{booking.review.comment}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">No review yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
