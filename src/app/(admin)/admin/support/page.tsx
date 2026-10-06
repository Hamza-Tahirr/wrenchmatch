import { CircleCheck, Link2, MessageSquareText, UserCog, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { SUPPORT_RESOLUTION_MAX_LENGTH, supportListQuerySchema } from "@/lib/validation/admin";
import type { SupportStatus, SupportTopic } from "@/lib/validation/support";
import { getSupportCounts, listSupportRequests, type AdminSupportRequestItem, type SupportCounts } from "@/server/admin/support";

import { ActionDialog } from "../_components/action-dialog";
import { BookingStatusBadge, NeonChip, SupportStatusBadge } from "../_components/badges";
import { ClientAvatar } from "../_components/client-avatar";
import { ConsoleEmpty, ConsoleHeader } from "../_components/console";
import { SegmentedLinks } from "../_components/segmented-links";
import { StatusSwap } from "../_components/status-swap";
import { Timestamp } from "../_components/timestamp";
import { AdminPagination, AdminTabs } from "../_components/touch";
import { roleLabel, withQuery } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";
import { resolveSupportRequestAction } from "./actions";

export const metadata: Metadata = { title: "Help desk" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type TabKey = SupportStatus | "all";

/** The topic filter: every topic, or account requests (sign-in, profile, deleting an account). */
type TopicKey = "every" | Extract<SupportTopic, "account">;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function countFor(counts: SupportCounts, tab: TabKey, topic: TopicKey): number {
  const statuses: SupportStatus[] = tab === "all" ? ["open", "resolved"] : [tab];
  return statuses.reduce((sum, status) => sum + (topic === "every" ? counts[status] : counts.topics[topic][status]), 0);
}

function SupportCard({ item, timeZone, now }: { item: AdminSupportRequestItem; timeZone: string; now: Date }) {
  const open = item.status === "open";
  const account = item.topic === "account";
  const deletion = item.mentionsAccountDeletion;
  return (
    <li>
      <article
        aria-labelledby={`support-${item.id}`}
        className={cn(
          "glass-lite card-hover relative space-y-4 rounded-2xl p-4 sm:p-5",
          // Account deletion requests carry a red edge so they stand out in the queue.
          open && deletion && "shadow-[inset_3px_0_0_0_var(--color-danger-500)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
            !open ? "via-success-500/50" : deletion ? "via-danger-500/70" : "via-warning-500/70",
          )}
        />
        <div className="flex min-w-0 gap-3">
          <ClientAvatar name={item.requester.displayName} size="md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 id={`support-${item.id}`} className="flex flex-wrap items-center gap-2 font-display text-base font-semibold text-fg">
              {account ? (
                // Account requests (sign-in, profile, deleting an account) carry their own mark.
                <span className="inline-flex items-center gap-1.5">
                  <UserCog aria-hidden="true" className="size-4 shrink-0 text-neon-violet" />
                  {item.topicLabel}
                </span>
              ) : (
                item.topicLabel
              )}
              <StatusSwap status={item.status}>
                <SupportStatusBadge status={item.status} />
              </StatusSwap>
            </h3>
            {deletion ? (
              <p>
                <NeonChip tone="danger" icon={<UserX />}>
                  Asks to delete an account
                </NeonChip>
              </p>
            ) : null}
            <p className="text-sm text-fg-muted">
              From <span className="font-medium text-fg">{item.requester.displayName}</span> (
              {roleLabel(item.requester.role)}) · opened{" "}
              <Timestamp iso={item.createdAt} timeZone={timeZone} format="relative" now={now} />
            </p>
          </div>
        </div>

        <blockquote className="flex gap-3 rounded-xl border-l-2 border-neon-cyan/50 bg-fg/[0.03] px-4 py-3 text-sm text-pretty whitespace-pre-line text-fg">
          <MessageSquareText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
          <span className="min-w-0 wrap-anywhere">{item.message}</span>
        </blockquote>

        {item.linkedRequest || item.linkedBooking ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            <Link2 aria-hidden="true" className="size-4 text-fg-subtle" />
            About
            {item.linkedRequest ? (
              <Link
                href={`/admin/requests/${item.linkedRequest.id}`}
                className={`inline-flex items-center font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
              >
                {item.linkedRequest.summary}
              </Link>
            ) : (
              "a booking"
            )}
            {item.linkedBooking ? <BookingStatusBadge status={item.linkedBooking.status} labelled /> : null}
          </p>
        ) : (
          <p className="text-sm text-fg-subtle">Not linked to a request or booking.</p>
        )}

        {item.status === "resolved" ? (
          <div className="rounded-xl border border-success-300/40 bg-success-50/50 px-4 py-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium text-success-800">
              <CircleCheck aria-hidden="true" className="size-4" />
              Resolved
              {item.resolvedBy ? ` by ${item.resolvedBy.displayName}` : ""}
              {item.resolvedAt ? (
                <span className="font-normal text-success-700">
                  <Timestamp iso={item.resolvedAt} timeZone={timeZone} />
                </span>
              ) : null}
            </p>
            {item.resolutionNote ? <p className="mt-1 whitespace-pre-line text-fg">{item.resolutionNote}</p> : null}
          </div>
        ) : null}

        {open ? (
          // After the message, where the eye ends up: full width on phones, at the right from sm.
          <div className="flex border-t border-line pt-4 sm:justify-end">
            <ActionDialog
              trigger="Resolve"
              triggerIcon={<CircleCheck />}
              triggerVariant="primary"
              triggerClassName="max-sm:w-full"
              title={`Resolve ${item.requester.displayName}'s help request?`}
              description={
                deletion
                  ? "Write what was done: for example, that the account was closed and the data removed. They receive it as a notification and an email (captured in the local outbox)."
                  : "Write what was done or decided. They receive it as a notification and an email (captured in the local outbox)."
              }
              action={resolveSupportRequestAction}
              hiddenFields={{ supportRequestId: item.id }}
              fields={[
                {
                  name: "resolutionNote",
                  label: "Resolution (shown to the person who asked)",
                  required: true,
                  rows: 5,
                  maxLength: SUPPORT_RESOLUTION_MAX_LENGTH,
                  hint: "At least 3 characters. Avoid contact details or exact addresses.",
                },
              ]}
              confirmLabel="Resolve request"
              pendingLabel="Resolving…"
              size="md"
            />
          </div>
        ) : null}
      </article>
    </li>
  );
}

export default async function SupportPage({ searchParams }: PageProps) {
  const { viewer, ctx, shell } = await adminPage("/admin/support");
  const params = await searchParams;
  const filters = supportListQuerySchema.parse(params);
  // Open requests by default; "all" shows both (open first).
  const current: TabKey = firstValue(params.status) === "all" ? "all" : (filters.status ?? "open");
  const topic: TopicKey = filters.topic === "account" ? "account" : "every";
  const [page, counts] = await Promise.all([
    listSupportRequests(ctx, viewer, {
      status: current === "all" ? undefined : current,
      topic: topic === "every" ? undefined : topic,
      page: filters.page,
    }),
    getSupportCounts(ctx, viewer),
  ]);
  const href = (key: TabKey, topicKey: TopicKey, target?: number) =>
    withQuery("/admin/support", {
      status: key === "open" ? undefined : key,
      topic: topicKey === "every" ? undefined : topicKey,
      page: target,
    });
  const labels: Record<TabKey, string> = { open: "Open", resolved: "Resolved", all: "All" };
  const accountOpen = counts.topics.account.open;

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Help desk"
        title="Help desk"
        description="Help and dispute requests from customers and mechanics, oldest open request first. Resolving one notifies the person who asked."
        meta={
          <>
            {counts.open > 0 ? (
              <NeonChip tone="warning" pulse>
                {counts.open} waiting for an answer
              </NeonChip>
            ) : (
              <NeonChip tone="success">Help desk clear</NeonChip>
            )}
            {accountOpen > 0 ? (
              <NeonChip tone="violet" icon={<UserCog />}>
                {accountOpen} open account {accountOpen === 1 ? "request" : "requests"}
              </NeonChip>
            ) : null}
          </>
        }
      />
      <div className="space-y-3">
        <AdminTabs
          label="Help request status"
          current={current}
          items={(["open", "resolved", "all"] as const).map((key) => ({
            key,
            href: href(key, topic),
            label: labels[key],
            count: countFor(counts, key, topic),
          }))}
        />
        <SegmentedLinks
          label="Help request topic"
          current={topic}
          links={[
            { key: "every", label: "Every topic", href: href(current, "every"), count: countFor(counts, current, "every") },
            {
              key: "account",
              label: "Account requests",
              href: href(current, "account"),
              count: countFor(counts, current, "account"),
            },
          ]}
        />
      </div>
      {page.items.length > 0 ? (
        <ul
          className="stagger-children space-y-4"
          aria-label={`${labels[current]} ${topic === "account" ? "account requests" : "help requests"}`}
        >
          {page.items.map((item) => (
            <SupportCard key={item.id} item={item} timeZone={shell.reportingTimeZone} now={ctx.now} />
          ))}
        </ul>
      ) : (
        <ConsoleEmpty
          illustration={current === "open" ? "success" : "no-notifications"}
          title={
            topic === "account"
              ? current === "open"
                ? "No open account requests"
                : "No account requests here"
              : current === "open"
                ? "The help desk is clear"
                : "No help requests here"
          }
        >
          {topic === "account"
            ? "Requests about signing in, profiles or deleting an account appear here. Customers and mechanics raise them from Help & support."
            : current === "open"
              ? "No open help requests. Customers and mechanics raise them from Help & support; admins are notified."
              : "Resolved requests appear here with their resolution."}
        </ConsoleEmpty>
      )}
      {page.totalPages > 1 ? (
        <AdminPagination
          label="Help request pages"
          page={page.page}
          totalPages={page.totalPages}
          prevHref={page.page > 1 ? href(current, topic, page.page - 1) : null}
          nextHref={page.page < page.totalPages ? href(current, topic, page.page + 1) : null}
        />
      ) : null}
    </div>
  );
}
