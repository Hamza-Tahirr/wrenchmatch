import {
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarClock,
  Camera,
  ClipboardList,
  FilePen,
  Inbox,
  LifeBuoy,
  Mail,
  Plus,
  Receipt,
  Scale,
  Star,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { SlideUp } from "@/components/motion/entrance";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { BOOKING_STATUS_INFO, BOOKING_STATUSES } from "@/lib/domain";
import { formatDate, formatDateTime, pluralize } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { getAccountOverview } from "@/server/customer/account";
import { getMyAvatar } from "@/server/media/avatar";

import { StatTiles } from "../_components/stat-tiles";
import { ratingText, Stars } from "../_components/stars";
import { formatSlotStart } from "../_lib/display";
import { AccountDeletion } from "./_components/account-deletion";
import { DashboardCard, DashboardList, DashboardRow } from "./_components/dashboard-card";

export const metadata: Metadata = { title: "Your account" };

const textLink = "font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline";

export default async function AccountPage() {
  const viewer = await requireRole("customer", "/account");
  const ctx = createAppContext();
  const [overview, avatar] = [await getAccountOverview(ctx, viewer), await getMyAvatar(ctx, viewer)];
  const {
    openRequests,
    quotesAwaitingDecision,
    pendingReservations,
    confirmedBookings,
    invoices,
    changeOrdersAwaitingApproval,
    reviews,
    supportRequests,
  } = overview;
  const bookingStatusSummary = BOOKING_STATUSES.filter((status) => confirmedBookings.countsByStatus[status] > 0)
    .map((status) => `${confirmedBookings.countsByStatus[status]} ${BOOKING_STATUS_INFO[status].label.toLowerCase()}`)
    .join(" · ");
  const attentionCount = changeOrdersAwaitingApproval.count + reviews.awaitingReviewCount;

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Account"
        title={
          <>
            Welcome back, <span className="holo-text">{viewer.displayName}</span>
          </>
        }
        description="Your repair requests, quotes, reservations and bookings in one place."
        actions={
          <ButtonLink href="/request" leadingIcon={<Plus />}>
            Request a repair
          </ButtonLink>
        }
      />

      <SlideUp
        as="section"
        aria-labelledby="profile-title"
        className="glass aurora relative mt-8 flex flex-col gap-5 overflow-hidden rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/account/photo"
            className="group relative shrink-0 rounded-full"
            aria-label={avatar ? "Change your profile picture" : "Add a profile picture"}
          >
            <Avatar name={viewer.displayName} src={avatar?.src ?? null} size="xl" />
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full border border-line-strong bg-elevated text-neon-cyan shadow-glow-sm transition-transform group-hover:scale-110"
            >
              <Camera className="size-3.5" />
            </span>
          </Link>
          <div className="min-w-0 space-y-1.5">
            <h2 id="profile-title" className="font-display text-xl font-semibold text-fg">
              {viewer.displayName}
            </h2>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
              <Mail aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
              <span className="truncate">{viewer.email}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success" icon={<BadgeCheck />}>
                Email auto-verified
              </Badge>
              <Badge>Customer account</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/account/photo" variant="secondary" leadingIcon={<Camera />}>
            {avatar ? "Profile picture" : "Add a profile picture"}
          </ButtonLink>
          <ButtonLink href="/support" variant="ghost" leadingIcon={<LifeBuoy />}>
            Help requests
          </ButtonLink>
          <ButtonLink href="/notifications" variant="ghost" leadingIcon={<Bell />}>
            Notifications
            {overview.unreadNotificationCount > 0 ? ` (${overview.unreadNotificationCount} unread)` : null}
          </ButtonLink>
        </div>
      </SlideUp>

      <StatTiles
        label="At a glance"
        className="mt-6"
        items={[
          { label: "Open requests", value: openRequests.count, icon: <ClipboardList />, hint: `${overview.totals.requests} in total`, href: "/quotes" },
          { label: "Quotes to compare", value: quotesAwaitingDecision.count, icon: <Scale />, tone: "violet", hint: "Across open requests", href: "/quotes" },
          { label: "Pending reservations", value: pendingReservations.count, icon: <CalendarClock />, tone: "warning", hint: "Online payments coming soon", href: "/bookings" },
          { label: "Bookings", value: confirmedBookings.count, icon: <Wrench />, tone: "success", hint: bookingStatusSummary || "Confirmed or completed", href: "/bookings" },
        ]}
      />

      {attentionCount > 0 ? (
        <section aria-labelledby="attention-title" className="mt-10 space-y-4">
          <div className="space-y-1">
            <p className="font-mono text-xs font-medium tracking-[0.2em] text-warning-700 uppercase">Action needed</p>
            <h2 id="attention-title" className="font-display text-xl font-semibold tracking-tight text-fg">
              Needs your attention
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {changeOrdersAwaitingApproval.count > 0 ? (
              <DashboardCard
                id="change-orders"
                title="Change orders to approve"
                icon={<FilePen />}
                count={changeOrdersAwaitingApproval.count}
                isEmpty={false}
                empty={null}
                className="glow-border"
              >
                <DashboardList>
                  {changeOrdersAwaitingApproval.items.map((order) => (
                    <DashboardRow
                      key={order.id}
                      href={`/bookings/${order.bookingId}#change-orders`}
                      title={order.description}
                      meta={`${order.bookingTitle} · proposed ${formatDate(order.createdAt, order.timeZone)}`}
                      trailing={<Money cents={order.amountCents} currency={order.currency} className="font-mono font-semibold" />}
                    />
                  ))}
                </DashboardList>
              </DashboardCard>
            ) : null}
            {reviews.awaitingReviewCount > 0 ? (
              <DashboardCard
                id="reviews-to-write"
                title="Reviews to write"
                icon={<Star />}
                count={reviews.awaitingReviewCount}
                isEmpty={false}
                empty={null}
                className="glow-border"
              >
                <DashboardList>
                  {reviews.awaitingReview.map((booking) => (
                    <DashboardRow
                      key={booking.id}
                      href={`/bookings/${booking.id}#review`}
                      title={booking.title}
                      meta={`${booking.mechanicDisplayName} · completed`}
                      trailing={<span className="text-brand-700">Write review</span>}
                    />
                  ))}
                </DashboardList>
              </DashboardCard>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="stagger-reveal mt-10 grid items-start gap-4 lg:grid-cols-2">
        <DashboardCard
          id="open-requests"
          title="Open requests"
          icon={<ClipboardList />}
          count={openRequests.count}
          viewAll={{ href: "/quotes", label: "All requests" }}
          isEmpty={openRequests.items.length === 0}
          empty={
            <>
              No open requests.{" "}
              <Link href="/request" className={textLink}>
                Request a repair
              </Link>{" "}
              to get quotes from approved mechanics.
            </>
          }
        >
          <DashboardList>
            {openRequests.items.map((request) => (
              <DashboardRow
                key={request.id}
                href={`/requests/${request.id}`}
                title={request.title}
                meta={`${request.areaLabel} · ${
                  request.matchedCount > 0 ? `sent to ${pluralize(request.matchedCount, "mechanic")}` : "our team was alerted"
                }`}
                badges={<Badge tone={request.statusTone}>{request.statusLabel}</Badge>}
                trailing={
                  request.liveQuoteCount > 0 ? (
                    <span className="font-medium">{pluralize(request.liveQuoteCount, "quote")}</span>
                  ) : (
                    <span className="text-fg-subtle">No quotes yet</span>
                  )
                }
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="quotes-awaiting"
          title="Quotes awaiting your decision"
          icon={<Scale />}
          count={quotesAwaitingDecision.count}
          viewAll={{ href: "/quotes", label: "Compare" }}
          isEmpty={quotesAwaitingDecision.requests.length === 0}
          empty="No quotes to decide on right now. New quotes appear here as mechanics respond."
        >
          <DashboardList>
            {quotesAwaitingDecision.requests.map((item) => (
              <DashboardRow
                key={item.requestId}
                href={`/requests/${item.requestId}#quotes`}
                title={item.title}
                meta={item.requestExpiresAt ? `Request open until ${formatDateTime(item.requestExpiresAt, item.timeZone)}` : null}
                trailing={
                  <>
                    <span className="block font-medium">{pluralize(item.liveQuoteCount, "quote")}</span>
                    {item.lowestLiveQuoteCents !== null ? (
                      <span className="text-xs text-fg-subtle">
                        from <Money cents={item.lowestLiveQuoteCents} className="font-mono" />
                      </span>
                    ) : null}
                  </>
                }
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="pending-reservations"
          title="Pending reservations"
          icon={<CalendarClock />}
          count={pendingReservations.count}
          viewAll={{ href: "/bookings", label: "All bookings" }}
          isEmpty={pendingReservations.items.length === 0}
          empty="No pending reservations. When you reserve a quote, it waits here: online payments are coming soon."
        >
          <DashboardList>
            {pendingReservations.items.map((booking) => (
              <DashboardRow
                key={booking.id}
                href={`/bookings/${booking.id}`}
                title={booking.title}
                meta={`${booking.mechanicDisplayName} · ${formatSlotStart(booking.slotStartAt, booking.timeZone)}`}
                badges={<Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>}
                trailing={<Money cents={booking.totalCents} currency={booking.currency} className="font-mono font-semibold" />}
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="bookings"
          title="Bookings"
          icon={<CalendarCheck />}
          count={confirmedBookings.count}
          viewAll={{ href: "/bookings", label: "All bookings" }}
          isEmpty={confirmedBookings.items.length === 0}
          empty="No bookings yet. Confirmed bookings appear here with their contact details, change orders and invoices."
          footer={confirmedBookings.items.length > 0 ? "Online payment: coming soon. Nothing has been charged online." : null}
        >
          <DashboardList>
            {confirmedBookings.items.map((booking) => (
              <DashboardRow
                key={booking.id}
                href={`/bookings/${booking.id}`}
                title={booking.title}
                meta={`${booking.mechanicDisplayName} · ${formatSlotStart(booking.slotStartAt, booking.timeZone)}`}
                badges={<Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>}
                trailing={<Money cents={booking.totalCents} currency={booking.currency} className="font-mono" />}
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="invoices"
          title="Invoices"
          icon={<Receipt />}
          count={invoices.count}
          isEmpty={invoices.items.length === 0}
          empty="No invoices yet. A mechanic issues one when a booked job is completed."
        >
          <DashboardList>
            {invoices.items.map((invoice) => (
              <DashboardRow
                key={invoice.id}
                href={`/bookings/${invoice.bookingId}#invoice`}
                title={
                  <>
                    Invoice <span className="font-mono">{invoice.invoiceNumber}</span>
                  </>
                }
                meta={`${invoice.title} · issued ${formatDate(invoice.issuedAt, invoice.timeZone)} · online payment coming soon`}
                trailing={<Money cents={invoice.totalCents} currency={invoice.currency} className="font-mono font-semibold" />}
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="reviews"
          title="Your reviews"
          icon={<Star />}
          count={reviews.givenCount}
          isEmpty={reviews.given.length === 0}
          empty={
            reviews.awaitingReviewCount > 0
              ? "You haven't left a review yet. Completed bookings waiting for one are listed above."
              : "No reviews yet. You can review a booking once its work is completed."
          }
        >
          <DashboardList>
            {reviews.given.map((review) => (
              <DashboardRow
                key={review.id}
                href={`/bookings/${review.bookingId}#review`}
                title={review.title}
                meta={review.comment ? `“${review.comment}”` : "No comment"}
                badges={
                  <>
                    <Stars rating={review.rating} />
                    <span className="sr-only">{ratingText(review.rating)}</span>
                  </>
                }
                trailing={<span className="font-mono text-xs text-fg-subtle">{formatDate(review.createdAt, review.timeZone)}</span>}
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="help-requests"
          title="Help requests"
          icon={<LifeBuoy />}
          count={supportRequests.openCount > 0 ? supportRequests.openCount : undefined}
          viewAll={{ href: "/support", label: "Help page" }}
          isEmpty={supportRequests.items.length === 0}
          empty={
            <>
              No help requests.{" "}
              <Link href="/support" className={textLink}>
                Ask for help
              </Link>{" "}
              with a booking, a cancellation or anything else.
            </>
          }
        >
          <DashboardList>
            {supportRequests.items.map((item) => (
              <DashboardRow
                key={item.id}
                href="/support"
                title={item.topicLabel}
                meta={`Sent ${formatDate(item.createdAt, item.timeZone)}${item.request ? ` · ${item.request.label}` : ""}`}
                badges={<Badge tone={item.statusTone}>{item.statusLabel}</Badge>}
              />
            ))}
          </DashboardList>
        </DashboardCard>

        <DashboardCard
          id="notifications"
          title="Notifications"
          icon={<Inbox />}
          count={overview.unreadNotificationCount}
          isEmpty
          empty={
            <>
              {overview.unreadNotificationCount > 0
                ? `You have ${pluralize(overview.unreadNotificationCount, "unread notification")}. `
                : "You're all caught up. "}
              <Link href="/notifications" className={`${textLink} inline-flex min-h-11 items-center`}>
                Open notifications
              </Link>
            </>
          }
        />
      </div>

      <div className="mt-10">
        <AccountDeletion requested={overview.accountDeletion} />
      </div>

      <p className="mt-10 flex items-start gap-2 text-sm text-fg-subtle">
        <CalendarCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Online payments are coming soon: reservations stay pending, and nothing has been charged online.
      </p>
    </PageContainer>
  );
}
