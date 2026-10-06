import "server-only";

import { sql, type SqlBool } from "kysely";

import { auditListQuerySchema } from "@/lib/validation/admin";
import type { AppContext, Viewer } from "@/server/context";

import { assertAdmin } from "./access";
import { AUDIT_ROWID, auditEventsQuery, toAuditEventItem, type AuditEventItem } from "./audit-items";
import { parseAdminInput } from "./input";
import { auditActionCode, auditActionLabel, auditActionsForCode, auditEntityLabel } from "./labels";
import { pageWindow, toPaged } from "./paging";
import type { Paged } from "./types";

export type AuditFilterOption = { value: string; label: string };

export type AuditLogPage = Paged<AuditEventItem> & {
  /** Entity types and actions present in the log, for filter dropdowns (actions by their shown code). */
  filters: { entityTypes: AuditFilterOption[]; actions: AuditFilterOption[] };
};

/**
 * The append-only audit log, newest first, filtered by exact entity type and/or action
 * code (auditActionCode: the stored name, or its presentation alias), with actor display
 * names. Includes the filter options present in the log.
 */
export async function listAuditEvents(
  ctx: AppContext,
  viewer: Viewer,
  filters: { entityType?: string; action?: string; page?: number } = {},
): Promise<AuditLogPage> {
  assertAdmin(viewer);
  const { entityType, action, page } = parseAdminInput(auditListQuerySchema, filters);

  const [entityTypes, actions] = await Promise.all([
    ctx.db.selectFrom("audit_events").select("entity_type").distinct().orderBy("entity_type").execute(),
    ctx.db.selectFrom("audit_events").select("action").distinct().orderBy("action").execute(),
  ]);
  const storedActions = actions.map((row) => row.action);
  // A code matches every stored name shown under it; an unknown code matches nothing.
  const actionFilter = action ? auditActionsForCode(action, storedActions) : null;

  const filtered = auditEventsQuery(ctx.db).where((eb) => {
    const conditions = [];
    if (entityType) conditions.push(eb("a.entity_type", "=", entityType));
    if (actionFilter) {
      conditions.push(actionFilter.length > 0 ? eb("a.action", "in", actionFilter) : sql<SqlBool>`0`);
    }
    return eb.and(conditions);
  });

  const { total } = await filtered
    .clearSelect()
    .select((eb) => eb.fn.countAll<number>().as("total"))
    .executeTakeFirstOrThrow();

  const window = pageWindow(page, Number(total));
  const rows = await filtered
    .orderBy("a.created_at", "desc")
    .orderBy(AUDIT_ROWID, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();

  const actionOptions = new Map<string, AuditFilterOption>();
  for (const stored of storedActions) {
    const code = auditActionCode(stored);
    if (!actionOptions.has(code)) actionOptions.set(code, { value: code, label: auditActionLabel(stored) });
  }

  return {
    ...toPaged(rows.map(toAuditEventItem), window, Number(total)),
    filters: {
      entityTypes: entityTypes.map((row) => ({ value: row.entity_type, label: auditEntityLabel(row.entity_type) })),
      actions: [...actionOptions.values()].sort((a, b) => a.value.localeCompare(b.value)),
    },
  };
}
