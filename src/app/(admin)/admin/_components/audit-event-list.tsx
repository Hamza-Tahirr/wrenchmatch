import Link from "next/link";

import { cn } from "@/lib/cn";
import type { AuditEventItem } from "@/server/admin/audit-items";

import { actorLabel } from "../_lib/display";
import { Timestamp } from "./timestamp";

type AuditEventListProps = {
  events: readonly AuditEventItem[];
  /** Accessible name of the list. */
  label: string;
  timeZone: string;
  now: Date;
  /** Hide the entity column entirely. */
  showEntity?: boolean;
  /** The current page: links to it are shown as plain text. */
  selfHref?: string;
};

const nodeByRole = {
  admin: "bg-neon-cyan shadow-[0_0_10px_var(--color-neon-cyan)]",
  system: "bg-neon-violet shadow-[0_0_10px_var(--color-neon-violet)]",
  other: "bg-fg-subtle",
} as const;

/** A newest-first activity timeline: what happened, to what, by whom, when and why. */
export function AuditEventList({ events, label, timeZone, now, showEntity = true, selfHref }: AuditEventListProps) {
  return (
    <ol aria-label={label} className="stagger-children relative space-y-0">
      {events.map((event, index) => {
        const role = event.actor.role === "admin" ? "admin" : event.actor.role === "system" ? "system" : "other";
        return (
          <li key={event.id} className="relative flex gap-3.5 pb-4 last:pb-0">
            {/* The rail between nodes (decorative). */}
            {index < events.length - 1 ? (
              <span aria-hidden="true" className="absolute top-4 bottom-0 left-[5px] w-px bg-gradient-to-b from-line-strong to-line" />
            ) : null}
            <span aria-hidden="true" className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-canvas/60", nodeByRole[role])} />
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              <p className="text-fg">
                <span className="font-medium">{event.actionLabel}</span>
                {showEntity ? (
                  <>
                    <span aria-hidden="true" className="text-fg-subtle">
                      {" · "}
                    </span>
                    <span className="sr-only">, </span>
                    {event.entityHref && event.entityHref !== selfHref ? (
                      <Link
                        href={event.entityHref}
                        title={event.entityLabel}
                        className="font-medium text-brand-700 underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                      >
                        {event.entityName ?? event.entityLabel}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">{event.entityName ?? event.entityLabel}</span>
                    )}
                  </>
                ) : null}
              </p>
              <p className="text-xs text-fg-subtle">
                {actorLabel(event.actor)} · <Timestamp iso={event.createdAt} timeZone={timeZone} format="relative" now={now} />
              </p>
              {event.reason ? (
                <p className="mt-1 rounded-lg border-l-2 border-neon-cyan/40 bg-fg/[0.03] px-2.5 py-1.5 text-pretty text-fg-muted">
                  <span className="sr-only">Reason: </span>
                  <span aria-hidden="true">&ldquo;</span>
                  {event.reason}
                  <span aria-hidden="true">&rdquo;</span>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
