import { CalendarCheck, ClipboardList, Inbox, Plus, Radio } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NoRequests, NoResults } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Stagger } from "@/components/motion/stagger";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { pluralize } from "@/lib/format";
import { requireRole } from "@/server/auth/viewer";
import { REQUEST_TTL_DAYS } from "@/server/config";
import { createAppContext } from "@/server/context";
import type { RequestSummary } from "@/server/customer/request-views";
import { listMyRequests } from "@/server/customer/requests";

import { StatTiles } from "../_components/stat-tiles";
import { RequestSummaryCard } from "../_components/summary-cards";

export const metadata: Metadata = { title: "Your requests and quotes" };

function RequestList({ requests }: { requests: readonly RequestSummary[] }) {
  return (
    <Stagger as="ul" className="space-y-4">
      {requests.map((request) => (
        <RequestSummaryCard key={request.id} request={request} />
      ))}
    </Stagger>
  );
}

function ListSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">{eyebrow}</p>
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold tracking-tight text-fg">
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-pretty text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default async function QuotesPage() {
  const viewer = await requireRole("customer", "/quotes");
  const requests = await listMyRequests(createAppContext(), viewer);

  const active = requests.filter((request) => request.status === "open" || request.status === "quoted");
  const reserved = requests.filter((request) => request.status === "reserved" || request.status === "booked");
  const closed = requests.filter(
    (request) => request.status === "expired" || request.status === "cancelled" || request.status === "draft",
  );
  const toCompare = active.reduce((sum, request) => sum + request.liveQuoteCount, 0);
  const notified = active.reduce((sum, request) => sum + request.matchedCount, 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Compare"
        title={
          <>
            Your requests and <span className="holo-text">quotes</span>
          </>
        }
        description={
          requests.length > 0
            ? `${pluralize(active.length, "active request")}${toCompare > 0 ? ` · ${pluralize(toCompare, "quote")} to compare` : ""}. Open a request to compare its quotes side by side.`
            : "Send a repair request and quotes from approved local mechanics will appear here."
        }
        actions={
          requests.length > 0 ? (
            <ButtonLink href="/request" leadingIcon={<Plus />}>
              New request
            </ButtonLink>
          ) : null
        }
      />

      {requests.length > 0 ? (
        <StatTiles
          label="Your requests at a glance"
          className="mt-8"
          items={[
            { label: "Active requests", value: active.length, icon: <ClipboardList />, hint: `Open for ${pluralize(REQUEST_TTL_DAYS, "day")}` },
            { label: "Quotes to compare", value: toCompare, icon: <Inbox />, tone: "violet", hint: "Ready to review" },
            { label: "Mechanics notified", value: notified, icon: <Radio />, hint: "On your active requests" },
            { label: "Reserved or booked", value: reserved.length, icon: <CalendarCheck />, tone: "success", href: "/bookings" },
          ]}
        />
      ) : null}

      <div className="mt-10 space-y-12">
        {requests.length === 0 ? (
          <EmptyState
            illustration={<NoRequests decorative className="w-44 sm:w-52" />}
            title="No requests yet"
            body="Describe what your car needs and we'll send it to approved mechanics nearby. You'll compare their itemized quotes here."
            action={
              <ButtonLink href="/request" leadingIcon={<Plus />}>
                Request a repair
              </ButtonLink>
            }
          />
        ) : (
          <>
            <ListSection
              id="active"
              eyebrow="In progress"
              title="Active requests"
              description={`Waiting for quotes, or with quotes ready to compare. Requests stay open for ${pluralize(REQUEST_TTL_DAYS, "day")}.`}
            >
              {active.length > 0 ? (
                <RequestList requests={active} />
              ) : (
                <EmptyState
                  headingLevel={3}
                  illustration={<NoResults decorative className="w-36" />}
                  title="No active requests"
                  body="All your requests are reserved, booked or closed."
                  action={
                    <ButtonLink href="/request" variant="secondary" leadingIcon={<Plus />}>
                      Request a repair
                    </ButtonLink>
                  }
                />
              )}
            </ListSection>
            {reserved.length > 0 ? (
              <ListSection id="reserved" eyebrow="Chosen" title="Reserved and booked" description="Requests where you chose a quote.">
                <RequestList requests={reserved} />
              </ListSection>
            ) : null}
            {closed.length > 0 ? (
              <ListSection
                id="past"
                eyebrow="Archive"
                title="Past requests"
                description="Expired or cancelled. Open one to send it again."
              >
                <RequestList requests={closed} />
              </ListSection>
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}
