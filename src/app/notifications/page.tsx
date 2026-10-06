import {
  BadgeCheck,
  Bell,
  BellOff,
  CalendarCheck,
  CheckCheck,
  ClipboardList,
  FilePen,
  Receipt,
  Star,
  UserRound,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { Callout } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SubmitButton } from "@/components/ui/submit-button";
import { NoNotifications } from "@/components/illustrations";
import { Stagger } from "@/components/motion/stagger";
import { cn } from "@/lib/cn";
import type { UserRole } from "@/lib/domain";
import { formatDateTime, pluralize } from "@/lib/format";
import { homePathFor, sanitizeNextPath } from "@/server/auth/redirects";
import { requireViewer } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { listForViewer, type NotificationItem } from "@/server/notifications/queries";
import { formatRelativeTime } from "./_components/relative-time";
import { markAllNotificationsReadAction, markNotificationReadAction, openNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

type NotificationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PATH = "/notifications";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(page: number): string {
  return page <= 1 ? PATH : `${PATH}?page=${page}`;
}

// Icon by event family ("quote.received" -> quote).
function iconFor(type: string): ReactNode {
  switch (type.split(".")[0]) {
    case "account":
      return <UserRound />;
    case "request":
      return <ClipboardList />;
    case "job":
      return <Wrench />;
    case "quote":
    case "invoice":
      return <Receipt />;
    case "booking":
    case "reservation":
      return <CalendarCheck />;
    case "change_order":
      return <FilePen />;
    case "review":
      return <Star />;
    case "mechanic":
    case "application":
      return <BadgeCheck />;
    default:
      return <Bell />;
  }
}

const EMPTY_COPY: Record<UserRole, { body: string; action: string; href: string }> = {
  customer: {
    body: "When you send a repair request, you'll see here how many mechanics were notified and when quotes arrive.",
    action: "Request a repair",
    href: "/request",
  },
  mechanic: {
    body: "Updates about your application and repair requests matched to you will appear here.",
    action: "Go to your job board",
    href: homePathFor("mechanic"),
  },
  admin: {
    body: "You'll be notified here when mechanics submit applications for review.",
    action: "Go to the dashboard",
    href: homePathFor("admin"),
  },
};

function NotificationRow({ item, now }: { item: NotificationItem; now: Date }) {
  const unread = item.readAt === null;
  const link = sanitizeNextPath(item.linkPath);
  // Repeated "View" / "Mark as read" buttons need the notification in their names.
  const viewLabel = `View: ${item.title}`;

  return (
    <li
      className={cn(
        "relative flex gap-3 px-4 py-4 transition-colors duration-200 hover:bg-fg/[0.03] sm:gap-4 sm:px-6",
        unread && "bg-neon-cyan/[0.05]",
      )}
    >
      {unread ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-linear-to-b from-neon-cyan to-neon-violet shadow-[0_0_12px_var(--color-neon-cyan)]"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border [&_svg]:size-[1.125rem]",
          unread
            ? "border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan shadow-glow-sm"
            : "border-line bg-fg/[0.04] text-fg-subtle",
        )}
      >
        {iconFor(item.type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className={cn("text-sm", unread ? "font-semibold text-fg" : "font-medium text-fg-muted")}>{item.title}</h2>
          {unread ? (
            <Badge tone="info" dot="pulse">
              Unread
            </Badge>
          ) : null}
        </div>
        {item.body ? <p className="mt-1 text-sm text-pretty text-fg-muted">{item.body}</p> : null}
        <p className="mt-1.5 font-mono text-[11px] tracking-wide text-fg-subtle uppercase">
          <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
            {formatRelativeTime(item.createdAt, now)}
          </time>
        </p>
        {link || unread ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {link && unread ? (
              <form action={openNotificationAction}>
                <input type="hidden" name="notificationId" value={item.id} />
                <SubmitButton variant="secondary" size="sm" pendingText="Opening…" aria-label={viewLabel}>
                  View
                </SubmitButton>
              </form>
            ) : null}
            {link && !unread ? (
              <ButtonLink href={link} variant="secondary" size="sm" aria-label={viewLabel}>
                View
              </ButtonLink>
            ) : null}
            {unread ? (
              <form action={markNotificationReadAction}>
                <input type="hidden" name="notificationId" value={item.id} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  pendingText="Marking as read…"
                  aria-label={`Mark as read: ${item.title}`}
                >
                  Mark as read
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const viewer = await requireViewer(PATH);
  const params = await searchParams;
  const requestedPage = Number.parseInt(firstValue(params.page) ?? "1", 10);
  const ctx = createAppContext();
  const data = await listForViewer(ctx, viewer, { page: Number.isNaN(requestedPage) ? 1 : requestedPage });
  const empty = EMPTY_COPY[viewer.role];

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Notifications"
        description="Updates about your requests, quotes, jobs and account."
        meta={
          data.totalCount > 0 ? (
            <Badge tone={data.unreadCount > 0 ? "info" : "neutral"}>
              {data.unreadCount > 0 ? `${pluralize(data.unreadCount, "unread notification")}` : "All caught up"}
            </Badge>
          ) : null
        }
        actions={
          data.unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <SubmitButton variant="secondary" leadingIcon={<CheckCheck />} pendingText="Marking all as read…">
                Mark all as read
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <div className="mt-8 space-y-6">
        {data.totalCount === 0 ? (
          <EmptyState
            icon={<BellOff />}
            illustration={<NoNotifications decorative />}
            title="No notifications yet"
            body={empty.body}
            action={
              <ButtonLink href={empty.href} variant="secondary">
                {empty.action}
              </ButtonLink>
            }
          />
        ) : (
          <>
            <Stagger
              as="ul"
              aria-label="Notifications, newest first"
              className="glass-lite divide-y divide-line overflow-hidden rounded-2xl"
            >
              {data.items.map((item) => (
                <NotificationRow key={item.id} item={item} now={ctx.now} />
              ))}
            </Stagger>
            {data.totalPages > 1 ? (
              <Pagination
                label="Notification pages"
                page={data.page}
                totalPages={data.totalPages}
                prevHref={data.page > 1 ? pageHref(data.page - 1) : null}
                nextHref={data.page < data.totalPages ? pageHref(data.page + 1) : null}
              />
            ) : null}
          </>
        )}
        <Callout tone="info" title="Updates live in the app">
          <p>
            Notifications appear here and on the bell in the header. During the pilot, emails are captured
            inside the app instead of being sent.
          </p>
        </Callout>
      </div>
    </PageContainer>
  );
}
