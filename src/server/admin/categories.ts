import "server-only";

import { sql } from "kysely";

import { categoryToggleSchema } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { effectiveRequestStatusSql } from "./effective-status";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";

// Service categories (the 12 seeded by migration 0001). Admins enable or disable them
// without deploying code: a disabled category is refused when a request is submitted and
// matching is not re-run for it. Existing requests keep their category.

export type AdminCategoryItem = {
  id: string;
  name: string;
  shortDescription: string;
  /** Extra notice shown to customers (e.g. "a code read is not a full diagnosis"). */
  customerNotice: string | null;
  /** Brakes and suspension: only safety-approved mechanics receive these requests. */
  safetySensitive: boolean;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
  /** Approved mechanics who offer the category. */
  approvedMechanicsOffering: number;
  /** Of those, how many are safety-approved for it; null for other categories. */
  safetyApprovedMechanics: number | null;
  /** Requests in the category waiting for quotes now (open or quoted). */
  activeRequests: number;
};

export type SetCategoryEnabledInput = { categoryId: string; enabled: boolean; reason?: string | null };
export type SetCategoryEnabledResult = {
  categoryId: string;
  enabled: boolean;
  /** False when the category was already in the requested state (nothing written). */
  changed: boolean;
};

/** Every category, enabled or not, in display order, with supply and demand counts. */
export async function listCategories(ctx: AppContext, viewer: Viewer): Promise<AdminCategoryItem[]> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const rows = await ctx.db
    .selectFrom("service_categories as c")
    .select([
      "c.id",
      "c.name",
      "c.short_description",
      "c.customer_notice",
      "c.safety_sensitive",
      "c.enabled",
      "c.sort_order",
      "c.updated_at",
      sql<number>`(SELECT count(*) FROM mechanic_services AS s
        JOIN mechanic_profiles AS mp ON mp.user_id = s.mechanic_id
        WHERE s.category_id = c.id AND mp.status = 'approved')`.as("offering"),
      sql<number>`(SELECT count(*) FROM mechanic_services AS s
        JOIN mechanic_profiles AS mp ON mp.user_id = s.mechanic_id
        WHERE s.category_id = c.id AND mp.status = 'approved' AND s.safety_approved = 1)`.as("safety_approved"),
      sql<number>`(SELECT count(*) FROM repair_requests AS r
        WHERE r.category_id = c.id AND ${effectiveRequestStatusSql("r", nowIso)} IN ('open', 'quoted'))`.as(
        "active_requests",
      ),
    ])
    .orderBy("c.sort_order")
    .execute();

  return rows.map((row) => {
    const safetySensitive = row.safety_sensitive === 1;
    return {
      id: row.id,
      name: row.name,
      shortDescription: row.short_description,
      customerNotice: row.customer_notice,
      safetySensitive,
      enabled: row.enabled === 1,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
      approvedMechanicsOffering: Number(row.offering),
      safetyApprovedMechanics: safetySensitive ? Number(row.safety_approved) : null,
      activeRequests: Number(row.active_requests),
    };
  });
}

/**
 * Enables or disables a category (optional reason, kept in the audit log). Disabling stops
 * new requests in the category and re-running matching for it; requests already submitted
 * continue. Writes nothing when the category is already in the requested state.
 *
 * Throws DomainError: forbidden, invalid_input, not_found.
 */
export async function setCategoryEnabled(
  ctx: AppContext,
  viewer: Viewer,
  input: SetCategoryEnabledInput,
): Promise<SetCategoryEnabledResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(categoryToggleSchema, input);

  return writeTx(ctx.db, async (trx) => {
    const category = await trx
      .selectFrom("service_categories")
      .select(["id", "name", "enabled"])
      .where("id", "=", data.categoryId)
      .executeTakeFirst();
    if (!category) throw new DomainError("not_found", "That service category doesn't exist.");

    const result = { categoryId: category.id, enabled: data.enabled };
    if ((category.enabled === 1) === data.enabled) return { ...result, changed: false };

    await trx
      .updateTable("service_categories")
      .set({ enabled: data.enabled ? 1 : 0, updated_at: ctx.now.toISOString() })
      .where("id", "=", category.id)
      .execute();
    await recordAudit(trx, {
      actor: viewer,
      action: data.enabled ? ADMIN_AUDIT_ACTIONS.categoryEnabled : ADMIN_AUDIT_ACTIONS.categoryDisabled,
      entityType: "category",
      entityId: category.id,
      reason: data.reason ?? null,
      metadata: { name: category.name },
      at: ctx.now,
    });
    return { ...result, changed: true };
  });
}
