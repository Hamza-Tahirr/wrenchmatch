import {
  Activity,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  FileClock,
  Gauge,
  LifeBuoy,
  Mail,
  Radar,
  Receipt,
  Satellite,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  WalletCards,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { ButtonLink } from "@/components/ui/button-link";
import {
  BOOKING_STATUS_INFO,
  BOOKING_STATUSES,
  MECHANIC_STATUS_INFO,
  MECHANIC_STATUSES,
  REQUEST_STATUS_INFO,
  REQUEST_STATUSES,
} from "@/lib/domain";
import { pluralize } from "@/lib/format";
import { getDashboard, type AdminDashboard } from "@/server/admin/dashboard";
import { listInsuranceExpiring, type InsuranceExpiringItem } from "@/server/admin/mechanics";
import { getOperationsMap } from "@/server/admin/operations-map";

import { AuditEventList } from "./_components/audit-event-list";
import { InsuranceBadge, MechanicStatusBadge, NeonChip, RequestStatusBadge } from "./_components/badges";
import { BarList } from "./_components/bar-list";
import { ConsoleEmpty, ConsoleHeader, ConsoleLink, IconWell, KpiTile, Panel } from "./_components/console";
import { OpsMap } from "./_components/maps/ops-map";
import { Timestamp } from "./_components/timestamp";
import { adminPage } from "./_lib/page-context";
import { TAP_TARGET } from "./_lib/ui";

export const metadata: Metadata = { title: { absolute: "Command center · Admin · WrenchMatch" } };

type AttentionItem = {
  key: string;
  icon: ReactNode;
  title: string;
  count: number;
  body: ReactNode;
  href: string;
  linkLabel: string;
};

function attentionItems(dashboard: AdminDashboard): AttentionItem[] {
  const { mechanics, requests } = dashboard;
  const items: AttentionItem[] = [
    {
      key: "zero-match",
      icon: <Radar />,
      title: "Requests that reached no mechanic",
      count: requests.openWithZeroMatches,
      body: "Waiting for quotes with nobody notified. See why on the matching page and re-run matching.",
      href: "/admin/matching",
      linkLabel: "Open matching",
    },
    {
      key: "applications",
      icon: <Users />,
      title: "Applications awaiting review",
      count: mechanics.awaitingReview,
      body: `${pluralize(mechanics.pendingDocuments, "uploaded document")} not reviewed yet.`,
      href: "/admin/mechanics?status=awaiting_review",
      linkLabel: "Review applications",
    },
    {
      key: "safety",
      icon: <ShieldCheck />,
      title: "Safety approvals pending",
      count: mechanics.safetyApprovalsPending,
      body: "Brake or suspension services offered without an admin approval. Those mechanics get no such requests.",
      href: "/admin/mechanics",
      linkLabel: "Open mechanics",
    },
    {
      key: "support",
      icon: <LifeBuoy />,
      title: "Open help requests",
      count: dashboard.supportRequestsOpen,
      body: "Customers and mechanics waiting for an answer, oldest first.",
      href: "/admin/support",
      linkLabel: "Open the help desk",
    },
  ];
  return items.filter((item) => item.count > 0);
}

function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  return (
    <ul className="stagger-children space-y-3">
      {items.map((item) => (
        <li
          key={item.key}
          className="group relative flex gap-3 rounded-xl border border-warning-300/30 bg-warning-50/40 p-3.5 transition-colors hover:border-warning-300/60"
        >
          <IconWell icon={item.icon} tone="warning" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
              {item.title}
              <NeonChip tone="warning" pulse>
                {item.count}
              </NeonChip>
            </p>
            <p className="mt-0.5 text-sm text-fg-muted">{item.body}</p>
            <ConsoleLink href={item.href} className={`mt-1.5 ${TAP_TARGET}`}>
              {item.linkLabel}
            </ConsoleLink>
          </div>
        </li>
      ))}
    </ul>
  );
}

function InsuranceList({ items }: { items: readonly InsuranceExpiringItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.mechanicId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Link
              href={`/admin/mechanics/${item.mechanicId}`}
              className={`flex min-w-0 items-center font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
            >
              <span className="truncate">{item.displayName}</span>
            </Link>
            <MechanicStatusBadge status={item.status} />
          </span>
          <InsuranceBadge insurance={item.insurance} />
        </li>
      ))}
    </ul>
  );
}

export default async function AdminDashboardPage() {
  const { viewer, ctx } = await adminPage("/admin");
  const [dashboard, insurance, map] = await Promise.all([
    getDashboard(ctx, viewer),
    listInsuranceExpiring(ctx, viewer),
    getOperationsMap(ctx, viewer),
  ]);
  const timeZone = dashboard.reportingTimeZone;
  const items = attentionItems(dashboard);
  const { mechanics, requests, bookings } = dashboard;
  const bookedActive = bookings.bookedByStatus.confirmed + bookings.bookedByStatus.in_progress;
  const mechanicTotal = MECHANIC_STATUSES.reduce((sum, status) => sum + mechanics.byStatus[status], 0);
  const enabledZips = map.zips.filter((zip) => zip.enabled).length;

  return (
    <div className="space-y-8">
      <ConsoleHeader
        eyebrow="Admin / Operations"
        title="Command center"
        description={
          <>
            Every number is counted from the marketplace database just now. Times are shown in {timeZone}, the pilot
            area&rsquo;s time zone.
          </>
        }
        meta={
          <>
            <NeonChip tone="success" pulse>
              Updated <Timestamp iso={dashboard.generatedAt} timeZone={timeZone} format="relative" now={ctx.now} />
            </NeonChip>
            <NeonChip tone="info">
              {enabledZips} of {pluralize(map.zips.length, "pilot ZIP")} enabled
            </NeonChip>
            <NeonChip tone="neutral">Online payments coming soon</NeonChip>
          </>
        }
        actions={
          <>
            <ButtonLink href="/admin/matching" variant="secondary" leadingIcon={<Radar />} className={TAP_TARGET}>
              Matching
            </ButtonLink>
            <ButtonLink href="/admin/mechanics?status=awaiting_review" leadingIcon={<Users />} className={TAP_TARGET}>
              Review queue
            </ButtonLink>
          </>
        }
      />

      <section aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="sr-only">
          Marketplace at a glance
        </h2>
        <ul className="stagger-children grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiTile
            label="Waiting for quotes"
            value={requests.open}
            hint={`${pluralize(requests.openWithZeroMatches, "request")} reached no mechanic`}
            href="/admin/requests?status=active"
            icon={<ClipboardList />}
            tone={requests.openWithZeroMatches > 0 ? "danger" : "cyan"}
            meter={{
              value: requests.open - requests.openWithZeroMatches,
              of: requests.open,
              label: `${requests.open - requests.openWithZeroMatches} of ${requests.open} reached at least one mechanic`,
            }}
          />
          <KpiTile
            label="Active quotes"
            value={dashboard.quotes.active}
            hint="Customers can still select them"
            href="/admin/marketplace?tab=quotes&status=submitted"
            icon={<Receipt />}
          />
          <KpiTile
            label="Reservations pending payment"
            value={bookings.pendingPayment}
            hint="Online payments are coming soon"
            href="/admin/marketplace?tab=reservations"
            icon={<WalletCards />}
            tone="warning"
          />
          <KpiTile
            label="Jobs booked"
            value={bookings.bookedTotal}
            hint={`${bookedActive} confirmed or in progress`}
            href="/admin/marketplace?tab=bookings&booked=1"
            icon={<CalendarCheck />}
            tone="violet"
          />
          <KpiTile
            label="Approved mechanics"
            value={mechanics.byStatus.approved}
            hint={`${mechanics.awaitingReview} awaiting review`}
            href="/admin/mechanics?status=approved"
            icon={<Users />}
            tone="success"
            meter={{
              value: mechanics.byStatus.approved,
              of: mechanicTotal,
              label: `${mechanics.byStatus.approved} of ${pluralize(mechanicTotal, "mechanic")} approved`,
            }}
          />
          <KpiTile
            label="Open help requests"
            value={dashboard.supportRequestsOpen}
            hint="Help desk, oldest first"
            href="/admin/support"
            icon={<LifeBuoy />}
            tone={dashboard.supportRequestsOpen > 0 ? "warning" : "cyan"}
          />
          <KpiTile
            label="Change orders awaiting customers"
            value={dashboard.changeOrdersAwaitingCustomer}
            hint="Customers approve before the work"
            href="/admin/marketplace?tab=bookings&booked=1"
            icon={<FileClock />}
            tone="violet"
          />
          <KpiTile
            label="Emails captured today"
            value={dashboard.emailsCapturedToday}
            hint="Local outbox · not sent"
            href="/admin/mailbox"
            icon={<Mail />}
          />
        </ul>
      </section>

      <Panel
        title="Operations map"
        icon={<Satellite />}
        variant="glass"
        description="Pilot coverage, requests waiting for quotes and approved mechanics' bases. Every point is a ZIP area, never an address."
        actions={
          <ButtonLink href="/admin/settings" variant="ghost" size="sm" trailingIcon={<ArrowRight />} className={TAP_TARGET}>
            Pilot area
          </ButtonLink>
        }
      >
        <OpsMap data={map} />
      </Panel>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Needs attention"
            icon={<Siren />}
            tone={items.length > 0 ? "warning" : "success"}
            description="Work waiting for an admin, most urgent first."
          >
            <div className="space-y-6">
              {items.length > 0 ? (
                <AttentionList items={items} />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-success-300/40 bg-success-50/50 p-4">
                  <AnimatedCheck size={40} />
                  <p className="text-sm text-fg-muted">
                    <span className="block font-semibold text-fg">All clear</span>
                    No applications to review, every active request reached a mechanic and the help desk is clear.
                  </p>
                </div>
              )}
              <div className="space-y-3 border-t border-line pt-5">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  <ShieldAlert aria-hidden="true" className="size-4 text-warning-600" />
                  Insurance expired or expiring within {mechanics.insuranceWarningDays} days
                  <NeonChip tone={insurance.length > 0 ? "warning" : "neutral"}>{insurance.length}</NeonChip>
                </h3>
                {insurance.length > 0 ? (
                  <InsuranceList items={insurance} />
                ) : (
                  <p className="text-sm text-fg-muted">Every mechanic&rsquo;s insurance is valid for at least a month.</p>
                )}
                <p className="text-xs text-fg-subtle">
                  Matching skips mechanics whose insurance has expired; approval needs a current policy.
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Recent requests"
            icon={<ClipboardList />}
            description="The newest submitted repair requests."
            actions={
              <ButtonLink href="/admin/requests" variant="ghost" size="sm" trailingIcon={<ArrowRight />} className={TAP_TARGET}>
                All requests
              </ButtonLink>
            }
          >
            {dashboard.recentRequests.length > 0 ? (
              <ul className="stagger-children divide-y divide-line">
                {dashboard.recentRequests.map((request) => (
                  <li key={request.id} className="relative space-y-1.5 py-3 first:pt-0 last:pb-0">
                    <p className="font-medium">
                      <Link
                        href={`/admin/requests/${request.id}`}
                        className="text-fg underline-offset-4 transition-colors after:absolute after:inset-0 hover:text-neon-cyan hover:underline"
                      >
                        {request.vehicle} · {request.categoryName}
                      </Link>
                    </p>
                    <p className="text-sm text-fg-muted">
                      {request.customer.displayName} · {request.areaLabel} ·{" "}
                      <Timestamp
                        iso={request.submittedAt ?? request.createdAt}
                        timeZone={request.timeZone}
                        format="relative"
                        now={ctx.now}
                      />
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RequestStatusBadge status={request.status} />
                      <NeonChip tone={request.matchedCount === 0 ? "danger" : "neutral"} pulse={request.matchedCount === 0}>
                        {pluralize(request.matchedCount, "mechanic")} notified
                      </NeonChip>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ConsoleEmpty bare headingLevel={3} illustration="no-requests" title="No requests yet">
                Submitted repair requests appear here.
              </ConsoleEmpty>
            )}
          </Panel>

        </div>

        <Panel
          title="Recent activity"
          icon={<Activity />}
          tone="violet"
          description="The newest audit events."
          actions={
            <ButtonLink href="/admin/audit" variant="ghost" size="sm" trailingIcon={<ArrowRight />} className={TAP_TARGET}>
              Audit log
            </ButtonLink>
          }
        >
          {dashboard.recentAuditEvents.length > 0 ? (
            <AuditEventList
              events={dashboard.recentAuditEvents}
              label="Recent audit events, newest first"
              timeZone={timeZone}
              now={ctx.now}
            />
          ) : (
            <p className="text-sm text-fg-subtle">No audit events yet.</p>
          )}
        </Panel>
      </div>

      <section aria-labelledby="breakdown-title" className="space-y-4">
        <h2 id="breakdown-title" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-fg">
          <Gauge aria-hidden="true" className="size-5 text-neon-cyan" />
          Status breakdown
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Panel title="Mechanics" titleAs="h3" icon={<Users />} tone="success">
            <BarList
              label="Mechanics by status"
              rows={MECHANIC_STATUSES.map((status) => ({
                key: status,
                label: MECHANIC_STATUS_INFO[status].label,
                value: mechanics.byStatus[status],
                href: `/admin/mechanics?status=${status}`,
                unit: "mechanics",
              }))}
            />
          </Panel>
          <Panel title="Requests" titleAs="h3" icon={<ClipboardList />}>
            <BarList
              label="Requests by status"
              rows={REQUEST_STATUSES.filter((status) => status !== "draft").map((status) => ({
                key: status,
                // "Waiting for quotes" above counts open and quoted requests together (as the
                // requests page does); the open status alone reads "No quotes yet" there too.
                label: status === "open" ? "No quotes yet" : REQUEST_STATUS_INFO[status].label,
                value: requests.byStatus[status],
                href: `/admin/requests?status=${status}`,
                unit: "requests",
              }))}
            />
          </Panel>
          <Panel
            title="Jobs"
            titleAs="h3"
            icon={<CalendarCheck />}
            tone="violet"
            description="Past the reservation. No online payment is taken yet."
          >
            <BarList
              label="Jobs by status"
              rows={BOOKING_STATUSES.filter((status) => status !== "pending_payment").map((status) => ({
                key: status,
                label: BOOKING_STATUS_INFO[status].label,
                value: bookings.bookedByStatus[status],
                href: `/admin/marketplace?tab=bookings&booked=1&status=${status}`,
                unit: "jobs",
              }))}
            />
          </Panel>
        </div>
      </section>
    </div>
  );
}
