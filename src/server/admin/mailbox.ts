import "server-only";

import { sql } from "kysely";

import { USER_ROLES, type UserRole } from "@/lib/domain";
import { mailboxListQuerySchema } from "@/lib/validation/admin";
import type { AppContext, Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";

import { assertAdmin } from "./access";
import { parseAdminInput, parseRecordId } from "./input";
import { pageWindow, toPaged } from "./paging";
import { oneOf, type Paged, type PersonRef } from "./types";

// The dev mailbox: every email the app "sends" is captured in email_outbox and shown here.
// Nothing is delivered over the network.

export type CapturedEmailListItem = {
  id: string;
  toEmail: string;
  /** The account the email was for, when it belongs to one (invitations do not). */
  recipient: (PersonRef & { role: UserRole }) | null;
  subject: string;
  /** e.g. "job_matched", "mechanic_invite" */
  template: string;
  /** First characters of the body, on one line. */
  preview: string;
  createdAt: string;
};

export type CapturedEmailDetail = CapturedEmailListItem & {
  bodyText: string;
  /** Always "captured_locally": nothing leaves this machine. */
  delivery: "captured_locally";
};

export type CapturedEmailPage = Paged<CapturedEmailListItem> & {
  /** Templates present in the mailbox, for a filter dropdown. */
  templates: string[];
};

const PREVIEW_LENGTH = 140;
const EMAIL_NOT_FOUND = "That email was not found in the local outbox.";

function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length <= PREVIEW_LENGTH ? oneLine : `${oneLine.slice(0, PREVIEW_LENGTH - 1)}…`;
}

function recipientOf(row: { to_user_id: string | null; recipient_name: string | null; recipient_role: string | null }) {
  if (row.to_user_id === null || row.recipient_name === null || row.recipient_role === null) return null;
  return {
    id: row.to_user_id,
    displayName: row.recipient_name,
    role: oneOf(USER_ROLES, row.recipient_role, "users.role"),
  };
}

function mailboxQuery(ctx: AppContext) {
  return ctx.db
    .selectFrom("email_outbox as e")
    .leftJoin("users as u", "u.id", "e.to_user_id")
    .select([
      "e.id",
      "e.to_email",
      "e.to_user_id",
      "u.display_name as recipient_name",
      "u.role as recipient_role",
      "e.subject",
      "e.template",
      "e.body_text",
      "e.delivery",
      "e.created_at",
    ]);
}

/** Captured emails, newest first, optionally one template only. */
export async function listCapturedEmails(
  ctx: AppContext,
  viewer: Viewer,
  filters: { template?: string; page?: number } = {},
): Promise<CapturedEmailPage> {
  assertAdmin(viewer);
  const { template, page } = parseAdminInput(mailboxListQuerySchema, filters);

  const filtered = template === undefined ? mailboxQuery(ctx) : mailboxQuery(ctx).where("e.template", "=", template);
  const [{ total }, templates] = await Promise.all([
    filtered
      .clearSelect()
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow(),
    ctx.db.selectFrom("email_outbox").select("template").distinct().orderBy("template").execute(),
  ]);
  const window = pageWindow(page, Number(total));
  const rows = await filtered
    .orderBy("e.created_at", "desc")
    .orderBy(sql`e.rowid`, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();

  return {
    ...toPaged(
      rows.map((row) => ({
        id: row.id,
        toEmail: row.to_email,
        recipient: recipientOf(row),
        subject: row.subject,
        template: row.template,
        preview: preview(row.body_text),
        createdAt: row.created_at,
      })),
      window,
      Number(total),
    ),
    templates: templates.map((row) => row.template),
  };
}

/** One captured email in full. Throws DomainError("not_found"). */
export async function getCapturedEmail(ctx: AppContext, viewer: Viewer, emailId: string): Promise<CapturedEmailDetail> {
  assertAdmin(viewer);
  const id = parseRecordId(emailId, EMAIL_NOT_FOUND);
  const row = await mailboxQuery(ctx).where("e.id", "=", id).executeTakeFirst();
  if (!row) throw new DomainError("not_found", EMAIL_NOT_FOUND);
  return {
    id: row.id,
    toEmail: row.to_email,
    recipient: recipientOf(row),
    subject: row.subject,
    template: row.template,
    preview: preview(row.body_text),
    createdAt: row.created_at,
    bodyText: row.body_text,
    delivery: "captured_locally",
  };
}
