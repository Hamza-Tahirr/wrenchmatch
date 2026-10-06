import "server-only";

import { mechanicRevealSchema } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";

export type RevealMechanicPrivateInput = {
  mechanicId: string;
  /** Why the admin needs the details (3-500 characters); stored in the audit log. */
  reason: string;
};

export type MechanicPrivateDetails = {
  mechanicId: string;
  legalName: string;
  businessName: string | null;
  phone: string;
  contactEmail: string;
  /** Exact garage address; null when none is on file (e.g. mobile-only mechanics). */
  garageAddress: { line1: string | null; city: string | null; state: string | null; zip: string | null } | null;
  insurancePolicyNumber: string | null;
  /** When this reveal was recorded (UTC ISO). */
  revealedAt: string;
};

/**
 * The mechanic's private record (legal/business name, phone, contact email, garage
 * address, insurance policy number) for an admin who gives a reason. Every reveal is
 * written to the audit log as "mechanic.private_revealed" with the reason, in the same
 * transaction that reads the data. Show the result once; do not cache it in the page.
 *
 * Throws DomainError: forbidden, invalid_input (reason), not_found (no such mechanic or no
 * private details on file yet).
 */
export async function revealMechanicPrivate(
  ctx: AppContext,
  viewer: Viewer,
  input: RevealMechanicPrivateInput,
): Promise<MechanicPrivateDetails> {
  assertAdmin(viewer);
  const data = parseAdminInput(mechanicRevealSchema, input);

  return writeTx(ctx.db, async (trx) => {
    const row = await trx
      .selectFrom("mechanic_private")
      .select([
        "user_id",
        "legal_name",
        "business_name",
        "phone",
        "contact_email",
        "garage_address_line1",
        "garage_city",
        "garage_state",
        "garage_zip",
        "insurance_policy_number",
      ])
      .where("user_id", "=", data.mechanicId)
      .executeTakeFirst();
    if (!row) {
      throw new DomainError("not_found", "No private details are on file for this mechanic.");
    }

    const hasGarage = [row.garage_address_line1, row.garage_city, row.garage_state, row.garage_zip].some(
      (part) => part !== null && part.trim() !== "",
    );
    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.mechanicPrivateRevealed,
      entityType: "mechanic",
      entityId: row.user_id,
      reason: data.reason,
      metadata: { fields: ["legal_name", "business_name", "phone", "contact_email", "garage_address", "insurance_policy_number"] },
      at: ctx.now,
    });

    return {
      mechanicId: row.user_id,
      legalName: row.legal_name,
      businessName: row.business_name,
      phone: row.phone,
      contactEmail: row.contact_email,
      garageAddress: hasGarage
        ? { line1: row.garage_address_line1, city: row.garage_city, state: row.garage_state, zip: row.garage_zip }
        : null,
      insurancePolicyNumber: row.insurance_policy_number,
      revealedAt: ctx.now.toISOString(),
    };
  });
}
