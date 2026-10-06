import "server-only";

import { DOCUMENT_KIND_INFO, DOCUMENT_KINDS, DOCUMENT_STATUSES, type DocumentStatus } from "@/lib/domain";
import {
  documentReviewSchema,
  safetyApprovalSchema,
  type DocumentReviewStatus,
} from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { notify } from "@/server/notifications/notify";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { emailText, sentence } from "./messages";
import { oneOf } from "./types";

export type SetSafetyApprovalInput = {
  mechanicId: string;
  categoryId: string;
  approved: boolean;
  /** Optional note kept in the audit log (e.g. the experience that was checked). */
  reason?: string | null;
};
export type SetSafetyApprovalResult = {
  mechanicId: string;
  categoryId: string;
  approved: boolean;
  /** False when the approval was already in the requested state (nothing written). */
  changed: boolean;
};

/**
 * Approves (or withdraws approval for) safety-sensitive work, brakes or suspension, for a
 * mechanic who offers that category. Matching sends such requests only to approved
 * mechanics; rerunMatching offers open requests to a newly approved one. Notifies the
 * mechanic and writes an audit event when something changes.
 *
 * Throws DomainError: forbidden, invalid_input (unknown or not safety-sensitive category),
 * not_found (mechanic), conflict (the mechanic does not offer the category).
 */
export async function setSafetyApproval(
  ctx: AppContext,
  viewer: Viewer,
  input: SetSafetyApprovalInput,
): Promise<SetSafetyApprovalResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(safetyApprovalSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const mechanic = await trx
      .selectFrom("mechanic_profiles")
      .select(["user_id", "display_name"])
      .where("user_id", "=", data.mechanicId)
      .executeTakeFirst();
    if (!mechanic) throw new DomainError("not_found", "That mechanic was not found.");

    const category = await trx
      .selectFrom("service_categories")
      .select(["id", "name", "safety_sensitive"])
      .where("id", "=", data.categoryId)
      .executeTakeFirst();
    if (!category) throw new DomainError("invalid_input", "That service category doesn't exist.");
    if (category.safety_sensitive !== 1) {
      throw new DomainError(
        "invalid_input",
        `${category.name} isn't safety-sensitive, so it doesn't need a separate approval.`,
      );
    }

    const service = await trx
      .selectFrom("mechanic_services")
      .select(["safety_approved"])
      .where("mechanic_id", "=", mechanic.user_id)
      .where("category_id", "=", category.id)
      .executeTakeFirst();
    if (!service) {
      throw new DomainError(
        "conflict",
        `${mechanic.display_name} doesn't offer ${category.name.toLowerCase()}, so there is nothing to approve. Only services a mechanic offers can be approved.`,
      );
    }

    const result = { mechanicId: mechanic.user_id, categoryId: category.id, approved: data.approved };
    if ((service.safety_approved === 1) === data.approved) return { ...result, changed: false };

    await trx
      .updateTable("mechanic_services")
      .set(
        data.approved
          ? { safety_approved: 1, safety_approved_by: viewer.id, safety_approved_at: nowIso }
          : { safety_approved: 0, safety_approved_by: null, safety_approved_at: null },
      )
      .where("mechanic_id", "=", mechanic.user_id)
      .where("category_id", "=", category.id)
      .execute();

    const work = category.name.toLowerCase();
    const title = data.approved ? `You're approved for ${work}` : `Your approval for ${work} was removed`;
    const body = data.approved
      ? `An admin approved you for ${work}. Matching ${work} requests can now be sent to you.`
      : `An admin removed your approval for ${work}, so ${work} requests are no longer sent to you. Use Help & support if you have questions.`;
    await notify(trx, {
      userId: mechanic.user_id,
      type: data.approved ? "mechanic.safety_approved" : "mechanic.safety_approval_removed",
      title,
      body,
      linkPath: "/mechanic/profile",
      email: {
        subject: title,
        text: emailText(mechanic.display_name, [body], "/mechanic/profile"),
        template: data.approved ? "mechanic_safety_approved" : "mechanic_safety_approval_removed",
      },
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: data.approved ? ADMIN_AUDIT_ACTIONS.safetyApprovalGranted : ADMIN_AUDIT_ACTIONS.safetyApprovalRemoved,
      entityType: "mechanic",
      entityId: mechanic.user_id,
      reason: data.reason ?? null,
      metadata: { categoryId: category.id },
      at: ctx.now,
    });
    return { ...result, changed: true };
  });
}

export type ReviewDocumentInput = {
  documentId: string;
  status: DocumentReviewStatus;
  /** Required (at least 3 characters) when rejecting; shown to the mechanic. */
  note?: string | null;
};

export type ReviewDocumentResult = {
  documentId: string;
  mechanicId: string;
  previousStatus: DocumentStatus;
  status: DocumentReviewStatus;
  /** False when the document already had this status and note (nothing written, nobody notified). */
  changed: boolean;
};

/**
 * Marks a mechanic document verified or rejected, with a note (required to reject). A
 * document can be reviewed again later, e.g. when a mistake is spotted. Records the
 * reviewer and time, notifies the mechanic and writes an audit event. Repeating the same
 * decision with the same note (a double submit) changes nothing.
 *
 * Throws DomainError: forbidden, invalid_input, not_found.
 */
export async function reviewDocument(
  ctx: AppContext,
  viewer: Viewer,
  input: ReviewDocumentInput,
): Promise<ReviewDocumentResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(documentReviewSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const document = await trx
      .selectFrom("mechanic_documents as d")
      .innerJoin("mechanic_profiles as p", "p.user_id", "d.mechanic_id")
      .select([
        "d.id",
        "d.mechanic_id",
        "d.kind",
        "d.status",
        "d.review_note",
        "d.expires_on",
        "p.display_name",
        "p.insurance_expires_on",
      ])
      .where("d.id", "=", data.documentId)
      .executeTakeFirst();
    if (!document) throw new DomainError("not_found", "That document was not found.");

    const previousStatus = oneOf(DOCUMENT_STATUSES, document.status, "mechanic_documents.status");
    const kind = oneOf(DOCUMENT_KINDS, document.kind, "mechanic_documents.kind");
    const note = data.note ?? null;
    const result = { documentId: document.id, mechanicId: document.mechanic_id, previousStatus, status: data.status };
    if (previousStatus === data.status && document.review_note === note) return { ...result, changed: false };

    await trx
      .updateTable("mechanic_documents")
      .set({ status: data.status, review_note: note, reviewed_by: viewer.id, reviewed_at: nowIso })
      .where("id", "=", document.id)
      .execute();

    const kindLabel = DOCUMENT_KIND_INFO[kind].label.toLowerCase();
    const verified = data.status === "verified";

    // A verified insurance certificate is the only way the insurance on file is extended
    // after review (mechanics can't change it from their profile form).
    const renewsInsurance =
      verified &&
      kind === "insurance" &&
      document.expires_on !== null &&
      (document.insurance_expires_on === null || document.expires_on > document.insurance_expires_on);
    if (renewsInsurance && document.expires_on) {
      await trx
        .updateTable("mechanic_profiles")
        .set({ insurance_expires_on: document.expires_on, updated_at: nowIso })
        .where("user_id", "=", document.mechanic_id)
        .execute();
    }

    const title = verified ? `Your ${kindLabel} was verified` : `Your ${kindLabel} was not accepted`;
    const body = verified
      ? `An admin verified the ${kindLabel} you uploaded.${
          renewsInsurance && document.expires_on ? ` Your insurance on file now runs until ${document.expires_on}.` : ""
        }${note ? ` Note: ${sentence(note)}` : ""}`
      : `Reason: ${sentence(note ?? "")} Upload a new copy from your profile.`;
    await notify(trx, {
      userId: document.mechanic_id,
      type: verified ? "mechanic.document_verified" : "mechanic.document_rejected",
      title,
      body,
      linkPath: "/mechanic/profile",
      email: {
        subject: title,
        text: emailText(document.display_name, [body], "/mechanic/profile"),
        template: verified ? "mechanic_document_verified" : "mechanic_document_rejected",
      },
      at: ctx.now,
    });
    await recordAudit(trx, {
      actor: viewer,
      action: verified ? ADMIN_AUDIT_ACTIONS.documentVerified : ADMIN_AUDIT_ACTIONS.documentRejected,
      entityType: "mechanic_document",
      entityId: document.id,
      reason: note,
      metadata: {
        mechanicId: document.mechanic_id,
        kind,
        from: previousStatus,
        to: data.status,
        ...(renewsInsurance ? { insuranceExpiresOn: document.expires_on } : {}),
      },
      at: ctx.now,
    });

    return { ...result, changed: true };
  });
}
