import { History, LifeBuoy, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { cache, Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { RequestPhotoAdder } from "@/components/media/request-photo-adder";
import { SlideUp } from "@/components/motion/entrance";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { pluralize } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { getMyRequest } from "@/server/customer/requests";

import { ExpiryCountdown } from "../../../_components/expiry-countdown";
import { Panel } from "../../../_components/facts";
import { Timeline } from "../../../_components/timeline";
import { firstParam, loadOr404, recordIdOr404, recordTitle } from "../../../_lib/load";
import { CancelRequestDialog } from "../_components/cancel-request-dialog";
import { QuotesSection } from "../_components/quotes-section";
import { RequestDetails } from "../_components/request-details";
import { RequestJourney } from "../_components/request-journey";
import { RequestStatusNotice } from "../_components/request-status-notice";

type RequestPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// One load per request render, shared by generateMetadata and the page.
const loadRequest = cache(async (id: string) => {
  const viewer = await requireRole("customer", `/requests/${id}`);
  const ctx = createAppContext();
  return { request: await getMyRequest(ctx, viewer, id), now: ctx.now.toISOString() };
});

export async function generateMetadata({ params }: Pick<RequestPageProps, "params">): Promise<Metadata> {
  const title = await recordTitle((await params).id, async (id) => (await loadRequest(id)).request.title, "Your request");
  return { title };
}

export default async function RequestDetailPage({ params, searchParams }: RequestPageProps) {
  const id = recordIdOr404((await params).id);
  const { request, now } = await loadOr404(() => loadRequest(id));
  const justSubmitted = firstParam((await searchParams).submitted) === "1";
  const closed = request.status === "expired" || request.status === "cancelled";
  const acceptingQuotes = request.status === "open" || request.status === "quoted";

  return (
    <PageContainer size="wide">
      <PageHeader
        back={{ href: "/quotes", label: "All requests" }}
        eyebrow={request.areaLabel}
        title={request.title}
        meta={
          <>
            <Badge tone={request.statusTone}>{request.statusLabel}</Badge>
            {request.matchedCount > 0 ? (
              <span className="text-sm text-fg-muted">Sent to {pluralize(request.matchedCount, "mechanic")}</span>
            ) : null}
          </>
        }
        actions={
          <>
            {request.canCancel && !request.awaitingAdminFollowUp ? (
              <CancelRequestDialog
                requestId={request.id}
                liveQuoteCount={request.liveQuoteCount}
                matchedCount={request.matchedCount}
              />
            ) : null}
            {closed ? (
              <ButtonLink href={`/request?from=${request.id}`} variant="secondary" leadingIcon={<RefreshCw />}>
                Request again
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/support?requestId=${request.id}`} variant="ghost" leadingIcon={<LifeBuoy />}>
              Get help
            </ButtonLink>
          </>
        }
      />

      <div className="mt-6 space-y-5">
        <SlideUp className="empty:hidden">
          <RequestStatusNotice request={request} justSubmitted={justSubmitted} />
        </SlideUp>
        <SlideUp delay={0.08}>
          <RequestJourney request={request} />
        </SlideUp>
      </div>

      <SlideUp delay={0.14} className="mt-10">
        <QuotesSection request={request} now={now} />
      </SlideUp>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <RequestDetails request={request} />
          {acceptingQuotes ? (
            <Suspense fallback={null}>
              <RequestPhotoAdder requestId={request.id} />
            </Suspense>
          ) : null}
        </div>
        <Panel
          as="section"
          title="Timeline"
          titleId="request-timeline-title"
          eyebrow="History"
          actions={<History aria-hidden="true" className="size-5 text-neon-cyan" />}
          className="min-w-0 lg:sticky lg:top-24"
          bodyClassName="space-y-5"
        >
          {acceptingQuotes && request.expiresAt ? (
            <ExpiryCountdown
              expiresAt={request.expiresAt}
              startedAt={request.submittedAt ?? undefined}
              now={now}
              timeZone={request.timeZone}
              noun="Request"
            />
          ) : null}
          <Timeline
            label="Request history"
            timeZone={request.timeZone}
            entries={request.timeline.map((event) => ({
              id: event.id,
              title: event.title,
              detail: event.detail,
              at: event.at,
              tone: event.tone,
            }))}
          />
        </Panel>
      </div>
    </PageContainer>
  );
}
