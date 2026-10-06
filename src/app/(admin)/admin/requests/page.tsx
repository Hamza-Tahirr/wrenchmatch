import { ArrowRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";
import { REQUEST_STATUS_INFO, REQUEST_STATUSES, type RequestStatus } from "@/lib/domain";
import { formatDate, pluralize } from "@/lib/format";
import { requestListQuerySchema, type RequestListFilter } from "@/lib/validation/admin";
import { getRequestStatusCounts, type RequestStatusCounts } from "@/server/admin/counts";
import type { AdminRequestListItem } from "@/server/admin/request-items";
import { listRequests } from "@/server/admin/requests";

import { NeonChip, RequestStatusBadge } from "../_components/badges";
import { ConsoleEmpty, ConsoleHeader } from "../_components/console";
import { ConsoleTable, MobileCardBody } from "../_components/console-table";
import { HiddenHeader } from "../_components/hidden-header";
import { SegmentedLinks } from "../_components/segmented-links";
import { Timestamp } from "../_components/timestamp";
import { AdminPagination, AdminTabs } from "../_components/touch";
import { requestModeLabel, withQuery } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";

export const metadata: Metadata = { title: "Requests" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type TabKey = RequestListFilter | "all";

const TAB_ORDER: readonly TabKey[] = ["all", "active", ...REQUEST_STATUSES.filter((status) => status !== "draft"), "draft"];

function tabLabel(key: TabKey): string {
  if (key === "all") return "All submitted";
  if (key === "active") return "Waiting for quotes";
  if (key === "open") return "No quotes yet";
  if (key === "draft") return "Drafts";
  return REQUEST_STATUS_INFO[key].label;
}

function tabCount(key: TabKey, counts: RequestStatusCounts): number {
  if (key === "all") return counts.submitted;
  if (key === "active") return counts.active;
  return counts.byStatus[key as RequestStatus];
}

function requestTitle(request: AdminRequestListItem): string {
  return `${request.vehicle} · ${request.categoryName}`;
}

function NotifiedChip({ request }: { request: AdminRequestListItem }) {
  return request.matchedCount === 0 ? (
    <NeonChip tone="danger" pulse={request.status === "open" || request.status === "quoted"}>
      None notified
    </NeonChip>
  ) : (
    <NeonChip tone="neutral">{pluralize(request.matchedCount, "mechanic")} notified</NeonChip>
  );
}

/** A request on a phone: the whole card opens it. */
function RequestCard({ request, now }: { request: AdminRequestListItem; now: Date }) {
  return (
    <MobileCardBody
      title={
        <Link
          href={`/admin/requests/${request.id}`}
          className="underline-offset-4 after:absolute after:inset-0 after:rounded-2xl hover:text-neon-cyan hover:underline"
        >
          {requestTitle(request)}
        </Link>
      }
      aside={<ChevronRight aria-hidden="true" className="mt-0.5 size-5 text-fg-subtle" />}
      meta={
        <>
          {request.areaLabel} · {requestModeLabel(request.serviceMode)} · preferred {formatDate(request.preferredDate)}
        </>
      }
      chips={
        <>
          <RequestStatusBadge status={request.status} />
          <NotifiedChip request={request} />
          <NeonChip tone={request.activeQuotesCount > 0 ? "info" : "neutral"}>
            {pluralize(request.quotesCount, "quote")}
            {request.quotesCount > 0 ? ` · ${request.activeQuotesCount} active` : ""}
          </NeonChip>
        </>
      }
      footer={
        <>
          {request.customer.displayName} ·{" "}
          {request.submittedAt ? (
            <>
              submitted <Timestamp iso={request.submittedAt} timeZone={request.timeZone} format="relative" now={now} />
            </>
          ) : (
            "draft"
          )}
        </>
      }
    />
  );
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const { viewer, ctx } = await adminPage("/admin/requests");
  const params = await searchParams;
  // The URL says ?zeroMatches=1 (short and shareable); the schema calls it zeroMatchesOnly.
  const filters = requestListQuerySchema.parse({ ...params, zeroMatchesOnly: params.zeroMatches ?? params.zeroMatchesOnly });
  const current: TabKey = filters.status ?? "all";
  const [page, counts] = await Promise.all([listRequests(ctx, viewer, filters), getRequestStatusCounts(ctx, viewer)]);
  const href = (overrides: { status?: TabKey; zeroMatchesOnly?: boolean; page?: number }) => {
    const status = overrides.status ?? current;
    return withQuery("/admin/requests", {
      status: status === "all" ? undefined : status,
      zeroMatches: overrides.zeroMatchesOnly ?? filters.zeroMatchesOnly,
      page: overrides.page,
    });
  };

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Requests"
        title="Repair requests"
        description="Every submitted repair request with its status as of now. Customers' contact details and exact addresses stay hidden until you reveal them with a reason."
        meta={
          <>
            <NeonChip tone="info">{counts.active} waiting for quotes</NeonChip>
            {counts.activeWithoutMatches > 0 ? (
              <NeonChip tone="danger" pulse>
                {counts.activeWithoutMatches} reached no mechanic
              </NeonChip>
            ) : (
              <NeonChip tone="success">Every active request reached a mechanic</NeonChip>
            )}
          </>
        }
      />

      <AdminTabs
        label="Request status"
        current={current}
        items={TAB_ORDER.map((key) => ({
          key,
          href: href({ status: key, page: 1 }),
          label: tabLabel(key),
          count: tabCount(key, counts),
        }))}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedLinks
          label="Matching filter"
          variant="segmented"
          current={filters.zeroMatchesOnly ? "zero" : "every"}
          links={[
            { key: "every", label: "Every request", href: href({ zeroMatchesOnly: false, page: 1 }) },
            {
              key: "zero",
              label: "No mechanic notified",
              href: href({ zeroMatchesOnly: true, page: 1 }),
              count: counts.activeWithoutMatches,
            },
          ]}
        />
        <p className="font-mono text-xs tracking-wide text-fg-subtle" role="status">
          {pluralize(page.totalCount, "request")}
          {filters.zeroMatchesOnly ? " that reached no mechanic" : ""}
        </p>
      </div>

      <ConsoleTable
        caption={`${tabLabel(current)}${filters.zeroMatchesOnly ? ", no mechanic notified" : ""}, newest first`}
        captionHidden
        dense
        rows={page.items}
        getRowKey={(request) => request.id}
        mobileCard={(request) => <RequestCard request={request} now={ctx.now} />}
        empty={
          <ConsoleEmpty
            illustration={filters.zeroMatchesOnly ? "success" : "no-requests"}
            title={filters.zeroMatchesOnly ? "Every request in this view reached a mechanic" : "No requests in this view"}
            action={
              <ButtonLink href="/admin/requests" variant="secondary" className={TAP_TARGET}>
                Show all submitted requests
              </ButtonLink>
            }
          >
            {filters.zeroMatchesOnly
              ? "Requests that notified nobody appear here (and on the matching page) so you can follow up."
              : "Requests appear here as customers submit them."}
          </ConsoleEmpty>
        }
        columns={[
          {
            key: "request",
            header: "Request",
            primary: true,
            className: "min-w-[15rem]",
            cell: (request) => (
              <span className="flex flex-col gap-1">
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="font-medium text-fg underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                >
                  {requestTitle(request)}
                </Link>
                <span className="text-xs font-normal text-fg-subtle">
                  {request.areaLabel} · {requestModeLabel(request.serviceMode)} · preferred {formatDate(request.preferredDate)}
                </span>
              </span>
            ),
          },
          { key: "customer", header: "Customer", cell: (request) => request.customer.displayName },
          { key: "status", header: "Status", cell: (request) => <RequestStatusBadge status={request.status} /> },
          {
            key: "matched",
            header: "Notified",
            align: "right",
            cell: (request) =>
              request.matchedCount === 0 ? (
                <NeonChip tone="danger" pulse={request.status === "open" || request.status === "quoted"}>
                  None
                </NeonChip>
              ) : (
                <span className="font-mono text-fg tabular">{request.matchedCount}</span>
              ),
          },
          {
            key: "quotes",
            header: "Quotes",
            align: "right",
            cell: (request) => (
              <span className="inline-flex flex-col items-end font-mono whitespace-nowrap tabular">
                <span className="text-fg">{request.quotesCount}</span>
                {request.quotesCount > 0 ? (
                  <span className="text-[11px] text-fg-subtle">{request.activeQuotesCount} active</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "submitted",
            header: "Submitted",
            cell: (request) =>
              request.submittedAt ? (
                <Timestamp
                  iso={request.submittedAt}
                  timeZone={request.timeZone}
                  format="relative"
                  now={ctx.now}
                  className="whitespace-nowrap"
                />
              ) : (
                <span className="text-fg-subtle">Draft</span>
              ),
          },
          {
            key: "open",
            header: <HiddenHeader>Actions</HiddenHeader>,
            actions: true,
            align: "right",
            cell: (request) => (
              <ButtonLink
                href={`/admin/requests/${request.id}`}
                size="sm"
                variant="secondary"
                trailingIcon={<ArrowRight />}
                aria-label={`Open ${requestTitle(request)}`}
              >
                {/* The table shows the arrow only (the row title is a link too); phone cards keep the word. */}
                <span className="sm:sr-only">Open</span>
              </ButtonLink>
            ),
          },
        ]}
      />

      {page.totalPages > 1 ? (
        <AdminPagination
          label="Request pages"
          page={page.page}
          totalPages={page.totalPages}
          prevHref={page.page > 1 ? href({ page: page.page - 1 }) : null}
          nextHref={page.page < page.totalPages ? href({ page: page.page + 1 }) : null}
        />
      ) : null}
    </div>
  );
}
