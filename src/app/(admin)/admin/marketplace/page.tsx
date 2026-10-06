import type { Metadata } from "next";

import { bookingListQuerySchema, quoteListQuerySchema, reviewListQuerySchema } from "@/lib/validation/admin";
import { listBookings, listQuotes, listReservations, listReviews } from "@/server/admin/marketplace";

import { NeonChip } from "../_components/badges";
import { ConsoleHeader } from "../_components/console";
import { adminPage } from "../_lib/page-context";
import { BookingsTab, ReservationsTab } from "./_components/bookings-tab";
import { QuotesTab } from "./_components/quotes-tab";
import { ReviewsTab } from "./_components/reviews-tab";
import { AdminTabs } from "../_components/touch";

export const metadata: Metadata = { title: "Marketplace" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS = ["quotes", "reservations", "bookings", "reviews"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Readonly<Record<Tab, string>> = {
  quotes: "Quotes",
  // The tab count and the tab itself say "pending payment"; a short label fits a phone.
  reservations: "Reservations",
  bookings: "Bookings",
  reviews: "Reviews",
};

function readTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  return TABS.find((tab) => tab === raw) ?? "quotes";
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const { viewer, ctx, shell } = await adminPage("/admin/marketplace");
  const params = await searchParams;
  const tab = readTab(params.tab);
  const quoteFilters = quoteListQuerySchema.parse(tab === "quotes" ? params : {});
  // The URL says ?booked=1 (short and shareable); the schema calls it bookedOnly.
  const bookingFilters = bookingListQuerySchema.parse(
    tab === "bookings" ? { ...params, bookedOnly: params.booked ?? params.bookedOnly } : {},
  );
  const reviewFilters = reviewListQuerySchema.parse(tab === "reviews" ? params : {});

  // Each tab's total (unfiltered) for the tab bar, plus the filtered list of the open tab.
  const [quotes, reservations, bookings, reviews, allQuotes, allBookings] = await Promise.all([
    listQuotes(ctx, viewer, quoteFilters),
    listReservations(ctx, viewer),
    listBookings(ctx, viewer, bookingFilters),
    listReviews(ctx, viewer, reviewFilters),
    quoteFilters.status ? listQuotes(ctx, viewer) : null,
    bookingFilters.status || bookingFilters.bookedOnly ? listBookings(ctx, viewer) : null,
  ]);
  const counts: Record<Tab, number> = {
    quotes: (allQuotes ?? quotes).totalCount,
    reservations: reservations.length,
    bookings: (allBookings ?? bookings).totalCount,
    reviews: reviews.totalCount,
  };

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Marketplace"
        title="Marketplace"
        description="Quotes, reservations, bookings and reviews across every request. Money shown is what the server computed and stored; no online payment is taken yet."
        meta={
          <>
            <NeonChip tone="info">{counts.quotes} quotes</NeonChip>
            <NeonChip tone="warning">{counts.reservations} pending payment</NeonChip>
            <NeonChip tone="neutral">Online payments coming soon</NeonChip>
          </>
        }
      />
      <AdminTabs
        label="Marketplace views"
        current={tab}
        items={TABS.map((key) => ({ key, href: `/admin/marketplace?tab=${key}`, label: TAB_LABELS[key], count: counts[key] }))}
      />
      {tab === "quotes" ? <QuotesTab page={quotes} status={quoteFilters.status} now={ctx.now} /> : null}
      {tab === "reservations" ? (
        <ReservationsTab reservations={reservations} timeZone={shell.reportingTimeZone} now={ctx.now} />
      ) : null}
      {tab === "bookings" ? (
        <BookingsTab page={bookings} status={bookingFilters.status} bookedOnly={bookingFilters.bookedOnly} />
      ) : null}
      {tab === "reviews" ? <ReviewsTab page={reviews} timeZone={shell.reportingTimeZone} /> : null}
    </div>
  );
}
