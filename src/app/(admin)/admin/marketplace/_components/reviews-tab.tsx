import { Star } from "lucide-react";
import Link from "next/link";

import type { AdminReviewItem } from "@/server/admin/marketplace";
import type { Paged } from "@/server/admin/types";

import { NeonChip } from "../../_components/badges";
import { ConsoleEmpty, ConsoleNote } from "../../_components/console";
import { ConsoleTable, MobileCardBody } from "../../_components/console-table";
import { HiddenHeader } from "../../_components/hidden-header";
import { Timestamp } from "../../_components/timestamp";
import { AdminPagination } from "../../_components/touch";
import { withQuery } from "../../_lib/display";
import { TAP_TARGET } from "../../_lib/ui";

function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={
              star <= value
                ? "size-4 fill-warning-600 text-warning-600 drop-shadow-[0_0_6px_var(--color-warning-600)]"
                : "size-4 text-fg-subtle/40"
            }
          />
        ))}
      </span>
      <span className="font-mono text-sm font-medium text-fg">{value}/5</span>
    </span>
  );
}

export function ReviewsTab({ page, timeZone }: { page: Paged<AdminReviewItem>; timeZone: string }) {
  const href = (target: number) => withQuery("/admin/marketplace", { tab: "reviews", page: target });
  return (
    <div className="space-y-4">
      <ConsoleNote icon={<Star />} tone="violet">
        Customers can review a completed booking once. Sample reviews loaded with the marketplace data are listed here for
        admins but never count toward a mechanic&rsquo;s rating; with no genuine reviews a mechanic shows as &ldquo;New&rdquo;.
      </ConsoleNote>
      <ConsoleTable
        caption="Reviews, newest first"
        captionHidden
        rows={page.items}
        getRowKey={(review) => review.id}
        mobileCard={(review) => (
          <MobileCardBody
            title={<Rating value={review.rating} />}
            aside={<Timestamp iso={review.createdAt} timeZone={timeZone} format="date" className="text-xs text-fg-subtle" />}
            meta={
              <>
                {review.customer.displayName} reviewed{" "}
                <Link
                  href={`/admin/mechanics/${review.mechanic.id}`}
                  className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
                >
                  {review.mechanic.displayName}
                </Link>
              </>
            }
            chips={
              review.isDemoFixture ? (
                <NeonChip tone="neutral">Sample review · not counted toward ratings</NeonChip>
              ) : (
                <NeonChip tone="success">Counts toward the rating</NeonChip>
              )
            }
            footer={
              <span className="flex flex-col gap-2">
                <span className="text-sm text-pretty text-fg-muted">{review.comment ?? "No comment"}</span>
                <Link
                  href={`/admin/requests/${review.requestId}`}
                  className={`inline-flex w-fit items-center text-sm font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
                >
                  View booking
                </Link>
              </span>
            }
          />
        )}
        empty={
          <ConsoleEmpty illustration="no-results" title="No reviews yet">
            Reviews appear after customers rate completed bookings.
          </ConsoleEmpty>
        }
        columns={[
          { key: "rating", header: "Rating", primary: true, cell: (review) => <Rating value={review.rating} /> },
          {
            key: "mechanic",
            header: "Mechanic",
            cell: (review) => (
              <Link
                href={`/admin/mechanics/${review.mechanic.id}`}
                className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
              >
                {review.mechanic.displayName}
              </Link>
            ),
          },
          { key: "customer", header: "Customer", cell: (review) => review.customer.displayName },
          {
            key: "comment",
            header: "Comment",
            className: "min-w-[16rem]",
            cell: (review) => (
              <span className="flex flex-col items-start gap-1.5">
                <span className="text-pretty text-fg">{review.comment ?? <span className="text-fg-subtle">No comment</span>}</span>
                {review.isDemoFixture ? (
                  <NeonChip tone="neutral">Sample review · not counted toward ratings</NeonChip>
                ) : (
                  <NeonChip tone="success">Counts toward the rating</NeonChip>
                )}
              </span>
            ),
          },
          {
            key: "date",
            header: "Left",
            cell: (review) => <Timestamp iso={review.createdAt} timeZone={timeZone} format="date" className="whitespace-nowrap" />,
          },
          {
            key: "booking",
            header: <HiddenHeader>Booking</HiddenHeader>,
            actions: true,
            align: "right",
            cell: (review) => (
              <Link
                href={`/admin/requests/${review.requestId}`}
                className="text-sm font-medium whitespace-nowrap text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
              >
                View booking
              </Link>
            ),
          },
        ]}
      />
      {page.totalPages > 1 ? (
        <AdminPagination
          label="Review pages"
          page={page.page}
          totalPages={page.totalPages}
          prevHref={page.page > 1 ? href(page.page - 1) : null}
          nextHref={page.page < page.totalPages ? href(page.page + 1) : null}
        />
      ) : null}
    </div>
  );
}
