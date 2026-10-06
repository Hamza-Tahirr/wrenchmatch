"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { sanitizeNextPath } from "@/server/auth/redirects";
import { requireViewer } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { isDomainError } from "@/server/errors";
import { markAllRead, markRead } from "@/server/notifications/queries";

const NOTIFICATIONS_PATH = "/notifications";
const notificationIdSchema = z.string().trim().min(1).max(64);

// The unread badge lives in the root layout's header, so refresh from the root.
function refreshUnreadBadge(): void {
  revalidatePath("/", "layout");
}

/** Marks one notification read and returns its link, ignoring ids that aren't the viewer's. */
async function markReadIfOwned(formData: FormData): Promise<string | null> {
  const viewer = await requireViewer(NOTIFICATIONS_PATH);
  const parsed = notificationIdSchema.safeParse(formData.get("notificationId"));
  if (!parsed.success) return null;
  try {
    const { linkPath } = await markRead(createAppContext(), viewer, parsed.data);
    return linkPath;
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") return null;
    throw error;
  }
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  await markReadIfOwned(formData);
  refreshUnreadBadge();
}

/** "View" on an unread notification: marks it read, then follows its link. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const linkPath = await markReadIfOwned(formData);
  refreshUnreadBadge();
  redirect(sanitizeNextPath(linkPath) ?? NOTIFICATIONS_PATH);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const viewer = await requireViewer(NOTIFICATIONS_PATH);
  await markAllRead(createAppContext(), viewer);
  refreshUnreadBadge();
}
