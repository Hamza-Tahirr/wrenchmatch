import "server-only";

import { MECHANIC_STATUS_INFO, MECHANIC_STATUSES, type MechanicStatus } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { todayInZone } from "@/lib/time";
import { mechanicStatusChangeSchema, type AdminMechanicStatus } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import { APP_NAME } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { notify, type NotifyInput } from "@/server/notifications/notify";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { insuranceStanding, type InsuranceStanding } from "./insurance";
import { ADMIN_AUDIT_ACTIONS } from "./labels";
import { emailText, sentence } from "./messages";
import { oneOf } from "./types";

/** Moves an admin may make from each status (mirrors the mechanic_profiles status trigger). */
export const ADMIN_STATUS_TRANSITIONS: Readonly<Record<MechanicStatus, readonly AdminMechanicStatus[]>> = {
  applied: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["suspended"],
  // approving a suspended mechanic reinstates them
  suspended: ["approved", "rejected"],
  // a rejected mechanic re-applies (rejected → applied) from their profile
  rejected: [],
};

/** What a status change means for the mechanic; approving a suspended mechanic is "reinstated". */
export type MechanicStatusEvent = "review_started" | "approved" | "reinstated" | "rejected" | "suspended";

export type SetMechanicStatusInput = {
  mechanicId: string;
  status: AdminMechanicStatus;
  /** Required (3-500 characters) for rejected and suspended; shown to the mechanic. */
  reason?: string | null;
};

export type SetMechanicStatusResult = {
  mechanicId: string;
  previousStatus: MechanicStatus;
  status: AdminMechanicStatus;
  event: MechanicStatusEvent;
};

/** Why approval is blocked by the mechanic's insurance right now, or null. */
export function approvalBlockedReason(insurance: InsuranceStanding): string | null {
  if (insurance.state === "missing") {
    return "Record the mechanic's insurance provider and expiry date before approving.";
  }
  if (insurance.state === "expired") {
    const when = insurance.expiresOn ? ` on ${formatDate(insurance.expiresOn)}` : "";
    return `The mechanic's insurance expired${when}. Ask for a current certificate and update the expiry date before approving.`;
  }
  return null;
}

function statusLabel(status: MechanicStatus): string {
  return MECHANIC_STATUS_INFO[status].label.toLowerCase();
}

function eventFor(from: MechanicStatus, to: AdminMechanicStatus): MechanicStatusEvent {
  if (to === "approved") return from === "suspended" ? "reinstated" : "approved";
  if (to === "under_review") return "review_started";
  return to;
}

const AUDIT_ACTION: Readonly<Record<MechanicStatusEvent, string>> = {
  review_started: ADMIN_AUDIT_ACTIONS.mechanicReviewStarted,
  approved: ADMIN_AUDIT_ACTIONS.mechanicApproved,
  reinstated: ADMIN_AUDIT_ACTIONS.mechanicReinstated,
  rejected: ADMIN_AUDIT_ACTIONS.mechanicRejected,
  suspended: ADMIN_AUDIT_ACTIONS.mechanicSuspended,
};

type StatusMessage = { title: string; body: string; linkPath: string };

function statusMessage(event: MechanicStatusEvent, reason: string | null): StatusMessage {
  const note = reason ? ` Note from the admin: ${sentence(reason)}` : "";
  switch (event) {
    case "review_started":
      return {
        title: "Your application is under review",
        body: `An admin has started reviewing your ${APP_NAME} application. We'll let you know the outcome here and by email.${note}`,
        linkPath: "/mechanic/profile",
      };
    case "approved":
      return {
        title: "Your application is approved",
        body: `You can now receive job matches. We'll notify you when a nearby request fits your services, makes, travel area and availability.${note}`,
        linkPath: "/mechanic/jobs",
      };
    case "reinstated":
      return {
        title: "Your account is reinstated",
        body: `You can now receive job matches again.${note}`,
        linkPath: "/mechanic/jobs",
      };
    case "rejected":
      return {
        title: "Your application was not approved",
        body: `Reason: ${sentence(reason ?? "")} You can update your application and apply again from your profile.`,
        linkPath: "/mechanic/profile",
      };
    case "suspended":
      return {
        title: "Your account is suspended",
        body: `Reason: ${sentence(reason ?? "")} You won't receive new job matches while your account is suspended. Use Help & support if you have questions.`,
        linkPath: "/mechanic/profile",
      };
  }
}

function notification(mechanic: { id: string; displayName: string }, event: MechanicStatusEvent, reason: string | null, at: Date): NotifyInput {
  const message = statusMessage(event, reason);
  return {
    userId: mechanic.id,
    type: `mechanic.${event}`,
    ...message,
    email: {
      subject: message.title,
      text: emailText(mechanic.displayName, [message.body], message.linkPath),
      template: `mechanic_${event}`,
    },
    at,
  };
}

/**
 * Moves a mechanic application through review: under review, approved (from suspended:
 * reinstated), rejected or suspended, following the status trigger's transitions. Rejecting
 * and suspending need a reason the mechanic can read. Approving needs an insurance
 * provider and an expiry date on or after today in the mechanic's base-ZIP time zone.
 * Records who changed it and when, notifies the mechanic (in-app and dev mailbox) and
 * writes an audit event. Matching picks the change up on the next run; use rerunMatching
 * to offer open requests to a newly approved mechanic.
 *
 * Throws DomainError: forbidden (not an admin), invalid_input, not_found, conflict (same
 * status or a transition the state machine forbids), mechanic_not_eligible (insurance).
 */
export async function setMechanicStatus(
  ctx: AppContext,
  viewer: Viewer,
  input: SetMechanicStatusInput,
): Promise<SetMechanicStatusResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(mechanicStatusChangeSchema, input);
  const nowIso = ctx.now.toISOString();

  return writeTx(ctx.db, async (trx) => {
    const mechanic = await trx
      .selectFrom("mechanic_profiles as p")
      .innerJoin("zip_centroids as z", "z.zip", "p.base_zip")
      .select(["p.user_id", "p.display_name", "p.status", "p.insurance_provider", "p.insurance_expires_on", "z.time_zone"])
      .where("p.user_id", "=", data.mechanicId)
      .executeTakeFirst();
    if (!mechanic) throw new DomainError("not_found", "That mechanic application was not found.");

    const from = oneOf(MECHANIC_STATUSES, mechanic.status, "mechanic_profiles.status");
    if (from === data.status) {
      throw new DomainError("conflict", `This mechanic is already ${statusLabel(from)}. Refresh to see the latest.`);
    }
    if (!ADMIN_STATUS_TRANSITIONS[from].includes(data.status)) {
      throw new DomainError(
        "conflict",
        `A mechanic who is ${statusLabel(from)} can't be moved to ${statusLabel(data.status)}.`,
        { from, to: data.status },
      );
    }

    const insurance = insuranceStanding({
      provider: mechanic.insurance_provider,
      expiresOn: mechanic.insurance_expires_on,
      today: todayInZone(ctx.now, mechanic.time_zone),
    });
    if (data.status === "approved") {
      const blocked = approvalBlockedReason(insurance);
      if (blocked) throw new DomainError("mechanic_not_eligible", blocked, { insurance: insurance.state });
    }

    const reason = data.reason ?? null;
    await trx
      .updateTable("mechanic_profiles")
      .set({
        status: data.status,
        status_reason: reason,
        status_changed_at: nowIso,
        status_changed_by: viewer.id,
        updated_at: nowIso,
        ...(data.status === "approved" ? { approved_at: nowIso } : {}),
      })
      .where("user_id", "=", mechanic.user_id)
      .execute();

    const event = eventFor(from, data.status);
    await notify(trx, notification({ id: mechanic.user_id, displayName: mechanic.display_name }, event, reason, ctx.now));
    await recordAudit(trx, {
      actor: viewer,
      action: AUDIT_ACTION[event],
      entityType: "mechanic",
      entityId: mechanic.user_id,
      reason,
      metadata: {
        from,
        to: data.status,
        ...(data.status === "approved" ? { insuranceExpiresOn: insurance.expiresOn } : {}),
      },
      at: ctx.now,
    });

    return { mechanicId: mechanic.user_id, previousStatus: from, status: data.status, event };
  });
}
