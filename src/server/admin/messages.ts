import "server-only";

import { APP_NAME } from "@/server/config";

// Small text helpers for the notifications and captured emails admin commands send.
// Messages never contain contact details or exact addresses.

/** Ends `text` with a full stop unless it already ends with punctuation. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** A plain-text email: greeting, paragraphs, the in-app link and a sign-off. */
export function emailText(displayName: string | null, paragraphs: readonly string[], linkPath: string | null): string {
  const lines = [displayName ? `Hi ${displayName},` : "Hello,", ""];
  for (const paragraph of paragraphs) lines.push(paragraph, "");
  if (linkPath) lines.push(`Sign in to ${APP_NAME} to see the details: ${linkPath}`, "");
  lines.push(`The ${APP_NAME} team`);
  return lines.join("\n");
}
