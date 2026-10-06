import "server-only";

import type { Tx } from "@/server/db/tx";
import { newId } from "@/server/ids";

export type NotifyEmail = {
  subject: string;
  /** Plain-text body. Like the in-app body: no contact details or exact addresses. */
  text: string;
  /** Template name shown in the dev mailbox, e.g. "quote_received". */
  template: string;
};

export type NotifyInput = {
  userId: string;
  /** Event type, e.g. "quote.received" (1-60 characters). */
  type: string;
  title: string;
  /** Never include phone numbers, emails or exact addresses. */
  body: string;
  /** App-relative link such as "/requests/<id>". */
  linkPath?: string | null;
  /** Also capture an email in email_outbox, addressed to the user's account email. */
  email?: NotifyEmail;
  /** Event time; pass ctx.now. Defaults to the database clock. */
  at?: Date;
};

export type NotifyResult = { notificationId: string; emailId: string | null };

// Column limits from the schema. Text is clipped rather than failing the whole transaction.
const MAX_TITLE = 140;
const MAX_BODY = 1000;
const MAX_SUBJECT = 200;
const MAX_EMAIL_TEXT = 5000;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function assertAppPath(linkPath: string): void {
  // "//host" and "/\host" would leave the site; the DB CHECK also rejects the former.
  if (!linkPath.startsWith("/") || linkPath.startsWith("//") || linkPath.includes("\\")) {
    throw new Error(`notify: linkPath must be an app-relative path, received "${linkPath}"`);
  }
}

/**
 * Writes an in-app notification and, when `email` is given, a locally captured email
 * (nothing is sent over the network), both inside the caller's transaction.
 */
export async function notify(trx: Tx, input: NotifyInput): Promise<NotifyResult> {
  if (input.type.length < 1 || input.type.length > 60) {
    throw new Error(`notify: type must be 1-60 characters, received "${input.type}"`);
  }
  const linkPath = input.linkPath ?? null;
  if (linkPath !== null) assertAppPath(linkPath);
  const createdAt = input.at ? { created_at: input.at.toISOString() } : {};

  const notificationId = newId();
  await trx
    .insertInto("notifications")
    .values({
      id: notificationId,
      user_id: input.userId,
      type: input.type,
      title: clip(input.title, MAX_TITLE),
      body: clip(input.body, MAX_BODY),
      link_path: linkPath,
      ...createdAt,
    })
    .execute();

  if (!input.email) return { notificationId, emailId: null };

  const recipient = await trx
    .selectFrom("users")
    .select(["email"])
    .where("id", "=", input.userId)
    .executeTakeFirst();
  if (!recipient) throw new Error(`notify: user ${input.userId} does not exist`);

  const emailId = newId();
  await trx
    .insertInto("email_outbox")
    .values({
      id: emailId,
      to_user_id: input.userId,
      to_email: recipient.email,
      subject: clip(input.email.subject, MAX_SUBJECT),
      body_text: clip(input.email.text, MAX_EMAIL_TEXT),
      template: input.email.template,
      ...createdAt,
    })
    .execute();
  return { notificationId, emailId };
}
