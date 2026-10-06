import "server-only";

import type { Viewer } from "@/server/context";
import type { Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";

export type AuditActor = Viewer | "system";

export type AuditInput = {
  actor: AuditActor;
  /** e.g. "mechanic.approve", "quote.select", "booking.cancel", "private_data.reveal" */
  action: string;
  /** e.g. "mechanic", "request", "quote", "booking", "file" */
  entityType: string;
  entityId?: string | null;
  /** Free-text reason given by the actor (max 500 characters). */
  reason?: string | null;
  /** Structured context. Never put contact details, addresses or file contents here. */
  metadata?: Record<string, unknown>;
  /** Event time; pass ctx.now. Defaults to the database clock. */
  at?: Date;
};

export const MAX_AUDIT_REASON_LENGTH = 500;

/**
 * Appends an audit event inside the caller's transaction (audit_events is append-only:
 * triggers reject updates and deletes). Returns the event id.
 */
export async function recordAudit(trx: Tx, input: AuditInput): Promise<string> {
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > MAX_AUDIT_REASON_LENGTH) {
    throw new DomainError(
      "invalid_input",
      `Keep the reason to ${MAX_AUDIT_REASON_LENGTH} characters or fewer.`,
    );
  }
  const id = newId();
  await trx
    .insertInto("audit_events")
    .values({
      id,
      actor_user_id: input.actor === "system" ? null : input.actor.id,
      actor_role: input.actor === "system" ? "system" : input.actor.role,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      reason,
      metadata_json: JSON.stringify(input.metadata ?? {}),
      ...(input.at ? { created_at: input.at.toISOString() } : {}),
    })
    .execute();
  return id;
}
