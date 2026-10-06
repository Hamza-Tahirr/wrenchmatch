import "server-only";

import { inviteMechanicSchema } from "@/lib/validation/admin";
import { recordAudit } from "@/server/audit";
import { APP_NAME } from "@/server/config";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";

import { assertAdmin } from "./access";
import { parseAdminInput } from "./input";
import { ADMIN_AUDIT_ACTIONS, maskEmail } from "./labels";
import { emailText, sentence } from "./messages";

/** Template name of invitation emails in the dev mailbox. */
export const MECHANIC_INVITE_TEMPLATE = "mechanic_invite";
export const MECHANIC_SIGNUP_PATH = "/signup?role=mechanic";

export type InviteMechanicInput = {
  email: string;
  /** Greeting name (optional). */
  name?: string | null;
  /** Personal note added to the email (optional); also kept as the audit reason. */
  note?: string | null;
};

export type InviteMechanicResult = {
  /** The captured email (dev mailbox); nothing is sent over the network. */
  emailId: string;
  toEmail: string;
  /** True when this address had already been invited before. */
  previouslyInvited: boolean;
};

const ROLE_WORDS = { customer: "a customer", mechanic: "a mechanic", admin: "an admin" } as const;

/**
 * Invites someone to apply as a mechanic: captures an email in the dev mailbox (template
 * "mechanic_invite", link /signup?role=mechanic) and writes an audit event. Addresses that
 * already have an account are refused with a friendly message. Re-inviting an address that
 * has no account yet is allowed.
 *
 * Throws DomainError: forbidden, invalid_input, conflict (an account exists).
 */
export async function inviteMechanic(
  ctx: AppContext,
  viewer: Viewer,
  input: InviteMechanicInput,
): Promise<InviteMechanicResult> {
  assertAdmin(viewer);
  const data = parseAdminInput(inviteMechanicSchema, input);

  return writeTx(ctx.db, async (trx) => {
    // users.email is COLLATE NOCASE, so this also finds differently capitalised addresses.
    const existing = await trx.selectFrom("users").select(["role"]).where("email", "=", data.email).executeTakeFirst();
    if (existing) {
      const kind = existing.role in ROLE_WORDS ? ROLE_WORDS[existing.role as keyof typeof ROLE_WORDS] : "an";
      throw new DomainError(
        "conflict",
        `${data.email} already has ${kind} account, so there's no need to invite them.${
          existing.role === "mechanic" ? " Find them under Mechanics." : ""
        }`,
        { fieldErrors: { email: ["This email already has an account."] } },
      );
    }

    const previous = await trx
      .selectFrom("email_outbox")
      .select("id")
      .where("template", "=", MECHANIC_INVITE_TEMPLATE)
      .where("to_email", "=", data.email)
      .executeTakeFirst();

    const subject = `You're invited to join ${APP_NAME} as a mechanic`;
    const paragraphs = [
      `${viewer.displayName} from the ${APP_NAME} team invited you to apply as a mechanic.`,
      ...(data.note ? [`Their note: ${sentence(data.note)}`] : []),
      `${APP_NAME} connects car owners with approved local mechanics. You set your own quotes, services, travel area and availability. Every application is reviewed by an admin (insurance, documents and services) before you receive job matches.`,
      `Create a mechanic account and complete your application: ${MECHANIC_SIGNUP_PATH}`,
    ];
    const emailId = newId();
    await trx
      .insertInto("email_outbox")
      .values({
        id: emailId,
        to_user_id: null,
        to_email: data.email,
        subject,
        body_text: emailText(data.name ?? null, paragraphs, null),
        template: MECHANIC_INVITE_TEMPLATE,
        created_at: ctx.now.toISOString(),
      })
      .execute();

    await recordAudit(trx, {
      actor: viewer,
      action: ADMIN_AUDIT_ACTIONS.mechanicInvited,
      entityType: "email",
      entityId: emailId,
      reason: data.note ?? null,
      metadata: { invitee: maskEmail(data.email), template: MECHANIC_INVITE_TEMPLATE, reinvite: previous !== undefined },
      at: ctx.now,
    });

    return { emailId, toEmail: data.email, previouslyInvited: previous !== undefined };
  });
}
