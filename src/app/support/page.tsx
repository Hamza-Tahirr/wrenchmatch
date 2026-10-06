import { CircleCheck, Hourglass, Inbox, MessageSquareReply, Phone, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NoNotifications } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { SlideUp } from "@/components/motion/entrance";
import { Stagger } from "@/components/motion/stagger";
import { Callout } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { RECORD_ID_PATTERN } from "@/lib/validation/request";
import { homePathFor } from "@/server/auth/redirects";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { listMySupportRequests, listSupportLinkOptions, type SupportRequestSummary } from "@/server/support/requests";

import { CountUp } from "../(customer)/_components/count-up";
import { SupportForm } from "./_components/support-form";

export const metadata: Metadata = { title: "Help requests" };

type SupportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const recordLink = "font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline";

function SupportRequestItem({ item }: { item: SupportRequestSummary }) {
  const resolved = item.status === "resolved";
  return (
    <li className={cn("glass-lite space-y-3 rounded-3xl p-4 sm:p-5", resolved ? "" : "border-warning-400/30")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-fg">{item.topicLabel}</h3>
          <p className="font-mono text-xs text-fg-subtle tabular">
            Sent <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, item.timeZone)}</time>
          </p>
        </div>
        <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
      </div>
      <p className="text-sm whitespace-pre-line text-pretty text-fg-muted">{item.message}</p>
      {item.request || item.booking ? (
        <ul className="text-sm">
          {item.request ? (
            <li className="flex gap-1.5">
              <span className="shrink-0 py-2.5 text-fg-subtle">About:</span>
              <Link href={item.request.href} className={`${recordLink} min-h-11 min-w-0 py-2.5`}>
                {item.request.label}
              </Link>
            </li>
          ) : null}
          {item.booking ? (
            <li className="flex gap-1.5">
              <span className="shrink-0 py-2.5 text-fg-subtle">Booking:</span>
              <Link href={item.booking.href} className={`${recordLink} min-h-11 min-w-0 py-2.5`}>
                {item.booking.label}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
      {resolved ? (
        <div className="rounded-2xl border border-success-500/30 bg-success-500/[0.08] p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-success-900">
            <MessageSquareReply aria-hidden="true" className="size-4" />
            Reply from the WrenchMatch team
          </p>
          <p className="mt-1 whitespace-pre-line text-fg">{item.resolutionNote ?? "Resolved without a note."}</p>
          {item.resolvedAt ? (
            <p className="mt-1 font-mono text-xs text-fg-subtle tabular">
              Resolved <time dateTime={item.resolvedAt}>{formatDateTime(item.resolvedAt, item.timeZone)}</time>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Hourglass aria-hidden="true" className="size-4 text-warning-600" />
          Waiting for a reply from our team.
        </p>
      )}
    </li>
  );
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const viewer = await requireRole(["customer", "mechanic"], "/support");
  const ctx = createAppContext();
  const [requests, linkOptions] = [await listMySupportRequests(ctx, viewer), await listSupportLinkOptions(ctx, viewer)];
  const params = await searchParams;

  // Prefill only the viewer's own records; anything else is ignored.
  const wantedRequest = firstValue(params.requestId) ?? "";
  const wantedBooking = firstValue(params.bookingId) ?? "";
  const requestId = RECORD_ID_PATTERN.test(wantedRequest) && linkOptions.requests.some((option) => option.id === wantedRequest) ? wantedRequest : undefined;
  const bookingId = RECORD_ID_PATTERN.test(wantedBooking) && linkOptions.bookings.some((option) => option.id === wantedBooking) ? wantedBooking : undefined;
  const ignoredLink = (wantedRequest !== "" && !requestId) || (wantedBooking !== "" && !bookingId);
  const openCount = requests.filter((item) => item.status === "open").length;
  const resolvedCount = requests.length - openCount;
  const isCustomer = viewer.role === "customer";

  return (
    <PageContainer>
      <PageHeader
        back={{ href: homePathFor(viewer.role), label: isCustomer ? "Your account" : "Job board" }}
        eyebrow="Support"
        title={
          <>
            Help <span className="holo-text">requests</span>
          </>
        }
        description="Ask the WrenchMatch team about a booking, a cancellation, a quote or anything else, and follow the reply here."
      />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SlideUp as="section" aria-labelledby="ask-title" className="glass glow-border rounded-3xl">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25">
              <Send className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 id="ask-title" className="font-display text-lg font-semibold text-fg">
                Ask for help
              </h2>
              <p className="text-sm text-fg-muted">
                A real person on our team reads every request and replies here, on the help desk.
              </p>
            </div>
          </div>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {ignoredLink ? (
              <Callout tone="info" title="We couldn't attach that record">
                <p>It isn&rsquo;t one of yours, or it no longer exists. Choose a request or booking below if it applies.</p>
              </Callout>
            ) : null}
            <SupportForm
              linkOptions={linkOptions}
              defaults={{ requestId, bookingId }}
              requestNoun={isCustomer ? "request" : "job"}
            />
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-600" />
              For an emergency or anything unsafe on the road, call 911 first.
            </p>
          </div>
        </SlideUp>

        <SlideUp as="section" delay={0.1} aria-labelledby="your-requests-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">History</p>
              <h2 id="your-requests-title" className="font-display text-xl font-semibold tracking-tight text-fg">
                Your help requests
              </h2>
            </div>
            {requests.length > 0 ? (
              <Badge tone={openCount > 0 ? "warning" : "success"} icon={openCount > 0 ? undefined : <CircleCheck />}>
                {openCount > 0 ? `${openCount} open` : "All resolved"}
              </Badge>
            ) : null}
          </div>
          {requests.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-lite rounded-2xl p-4">
                <p className="font-mono text-2xl font-semibold text-fg tabular text-glow">
                  <CountUp value={openCount} />
                </p>
                <p className="text-xs text-fg-subtle">Waiting for a reply</p>
              </div>
              <div className="glass-lite rounded-2xl p-4">
                <p className="font-mono text-2xl font-semibold text-fg tabular text-glow">
                  <CountUp value={resolvedCount} />
                </p>
                <p className="text-xs text-fg-subtle">Resolved</p>
              </div>
            </div>
          ) : null}
          {requests.length === 0 ? (
            <EmptyState
              illustration={<NoNotifications decorative className="w-36" />}
              icon={<Inbox />}
              headingLevel={3}
              title="No help requests yet"
              body="When you send one, it appears here with our reply."
            />
          ) : (
            <Stagger as="ul" className="space-y-3">
              {requests.map((item) => (
                <SupportRequestItem key={item.id} item={item} />
              ))}
            </Stagger>
          )}
        </SlideUp>
      </div>
    </PageContainer>
  );
}
