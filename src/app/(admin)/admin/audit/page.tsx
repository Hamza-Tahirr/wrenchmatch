import { Funnel, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Select } from "@/components/ui/select";
import { pluralize } from "@/lib/format";
import { auditListQuerySchema } from "@/lib/validation/admin";
import type { AuditEventItem } from "@/server/admin/audit-items";
import { listAuditEvents } from "@/server/admin/audit-log";
import type { JsonValue } from "@/server/admin/types";

import { NeonChip } from "../_components/badges";
import { ConsoleEmpty, ConsoleHeader } from "../_components/console";
import { ConsoleTable } from "../_components/console-table";
import { Timestamp } from "../_components/timestamp";
import { AdminPagination } from "../_components/touch";
import { roleLabel, withQuery } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";

export const metadata: Metadata = { title: "Audit log" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function metadataText(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Internal bookkeeping flags (e.g. which rows are seeded) are not shown. */
const HIDDEN_METADATA_KEY = /demo/i;

/** The event's action code, record id and recorded metadata, collapsed under the action. */
function EventDetails({ event }: { event: AuditEventItem }) {
  const entries = Object.entries(event.metadata).filter(([key]) => !HIDDEN_METADATA_KEY.test(key));
  return (
    <details className="group mt-1 text-xs font-normal open:min-w-64">
      {/* Positioned so the screen-reader text stays inside the table's scroll area. */}
      <summary className="relative w-fit font-medium text-brand-700 transition-colors hover:text-neon-cyan max-sm:py-3.5">
        Details{entries.length > 0 ? ` (${entries.length})` : ""}
        <span className="sr-only"> of {event.actionLabel}</span>
      </summary>
      <dl className="mt-2 animate-slide-down space-y-1.5 rounded-xl border border-line bg-canvas/60 p-3">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">action</dt>
          <dd className="font-mono break-all text-neon-cyan">{event.actionCode}</dd>
        </div>
        {event.entityId ? (
          <div>
            <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">record id</dt>
            <dd className="font-mono break-all text-fg">{event.entityId}</dd>
          </div>
        ) : null}
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{key}</dt>
            <dd className="font-mono break-all whitespace-pre-wrap text-fg">{metadataText(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** One event on a phone: what happened and when, who did it to which record, why, and the details. */
function AuditCard({ event, timeZone, now }: { event: AuditEventItem; timeZone: string; now: Date }) {
  const record = event.entityName ?? event.entityLabel;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-start gap-2 font-medium text-fg">
          <ScrollText aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-neon-violet" />
          {event.actionLabel}
        </p>
        <span className="shrink-0 text-xs text-fg-subtle">
          <Timestamp iso={event.createdAt} timeZone={timeZone} format="relative" now={now} />
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-muted">
        <span className="text-fg">{event.actor.displayName}</span>
        <NeonChip tone={event.actor.role === "admin" ? "info" : event.actor.role === "system" ? "violet" : "neutral"}>
          {roleLabel(event.actor.role)}
        </NeonChip>
        <span aria-hidden="true">·</span>
        {event.entityHref ? (
          <Link
            href={event.entityHref}
            className={`inline-flex items-center font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline ${TAP_TARGET}`}
          >
            {record}
          </Link>
        ) : (
          <span className="text-fg">{record}</span>
        )}
        {event.entityName ? <span className="text-xs text-fg-subtle">({event.entityLabel})</span> : null}
      </p>
      {event.reason ? (
        <p className="rounded-lg border-l-2 border-neon-cyan/40 bg-fg/[0.03] px-2.5 py-1.5 text-pretty text-fg-muted">
          <span className="sr-only">Reason: </span>
          {event.reason}
        </p>
      ) : null}
      <p className="text-xs text-fg-subtle">
        <Timestamp iso={event.createdAt} timeZone={timeZone} />
      </p>
      <EventDetails event={event} />
    </div>
  );
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const { viewer, ctx, shell } = await adminPage("/admin/audit");
  const filters = auditListQuerySchema.parse(await searchParams);
  const log = await listAuditEvents(ctx, viewer, filters);
  const filtered = Boolean(filters.entityType || filters.action);
  const href = (page: number) => withQuery("/admin/audit", { entityType: filters.entityType, action: filters.action, page });

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Audit log"
        title="Audit log"
        description={`The append-only record of who did what, to which record, when and why: approvals, reveals of private data, document views, interventions, settings and marketplace events. Times are in ${shell.reportingTimeZone}.`}
        meta={<NeonChip tone="violet">{pluralize(log.totalCount, "event")}</NeonChip>}
      />

      <Form
        action="/admin/audit"
        aria-label="Filter the audit log"
        className="glass-lite grid grid-cols-1 gap-3 rounded-2xl p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <label htmlFor="audit-entity" className="block text-sm font-medium text-fg">
            Record type
          </label>
          <Select id="audit-entity" name="entityType" defaultValue={filters.entityType ?? ""}>
            <option value="">Every record type</option>
            {log.filters.entityTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="block text-sm font-medium text-fg">
            Action
          </label>
          <Select id="audit-action" name="action" defaultValue={filters.action ?? ""}>
            <option value="">Every action</option>
            {log.filters.actions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2 max-sm:[&>*]:flex-1">
          <Button type="submit" variant="secondary" leadingIcon={<Funnel />} className={TAP_TARGET}>
            Apply
          </Button>
          {filtered ? (
            <ButtonLink href="/admin/audit" variant="ghost" className={TAP_TARGET}>
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </Form>

      <p className="font-mono text-xs text-fg-subtle" role="status">
        {pluralize(log.totalCount, "event")}
        {filtered ? " match the filters" : " in total"}, newest first.
      </p>

      <ConsoleTable
        caption="Audit events, newest first"
        captionHidden
        rows={log.items}
        getRowKey={(event) => event.id}
        mobileCard={(event) => <AuditCard event={event} timeZone={shell.reportingTimeZone} now={ctx.now} />}
        empty={
          <ConsoleEmpty
            illustration="no-results"
            title="No audit events match"
            action={
              filtered ? (
                <ButtonLink href="/admin/audit" variant="secondary" className={TAP_TARGET}>
                  Clear the filters
                </ButtonLink>
              ) : undefined
            }
          >
            Admin decisions, reveals and marketplace events are recorded here as they happen.
          </ConsoleEmpty>
        }
        columns={[
          {
            key: "action",
            header: "Action",
            primary: true,
            className: "min-w-[10rem]",
            cell: (event) => (
              <span className="flex flex-col">
                <span className="flex items-center gap-2">
                  <ScrollText aria-hidden="true" className="size-3.5 shrink-0 text-neon-violet" />
                  {event.actionLabel}
                </span>
                <EventDetails event={event} />
              </span>
            ),
          },
          {
            key: "actor",
            header: "Actor",
            cell: (event) => (
              <span className="flex flex-col items-start gap-1">
                <span className="text-fg">{event.actor.displayName}</span>
                <NeonChip tone={event.actor.role === "admin" ? "info" : event.actor.role === "system" ? "violet" : "neutral"}>
                  {roleLabel(event.actor.role)}
                </NeonChip>
              </span>
            ),
          },
          {
            key: "entity",
            header: "Record",
            className: "min-w-[9rem]",
            cell: (event) => (
              <span className="flex flex-col gap-0.5">
                {event.entityHref ? (
                  <Link
                    href={event.entityHref}
                    className="font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline"
                  >
                    {event.entityName ?? event.entityLabel}
                  </Link>
                ) : (
                  <span className="text-fg">{event.entityName ?? event.entityLabel}</span>
                )}
                {event.entityName ? <span className="text-xs text-fg-subtle">{event.entityLabel}</span> : null}
              </span>
            ),
          },
          {
            key: "reason",
            header: "Reason",
            className: "min-w-[11rem]",
            cell: (event) => (event.reason ? <span className="text-pretty">{event.reason}</span> : <span className="text-fg-subtle">—</span>),
          },
          {
            key: "time",
            header: "Time",
            cell: (event) => (
              <span className="flex flex-col whitespace-nowrap">
                <Timestamp iso={event.createdAt} timeZone={shell.reportingTimeZone} />
                <span className="text-xs text-fg-subtle">
                  <Timestamp iso={event.createdAt} timeZone={shell.reportingTimeZone} format="relative" now={ctx.now} />
                </span>
              </span>
            ),
          },
        ]}
      />

      {log.totalPages > 1 ? (
        <AdminPagination
          label="Audit log pages"
          page={log.page}
          totalPages={log.totalPages}
          prevHref={log.page > 1 ? href(log.page - 1) : null}
          nextHref={log.page < log.totalPages ? href(log.page + 1) : null}
        />
      ) : null}
    </div>
  );
}
