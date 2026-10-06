import type { ReactNode } from "react";

import { requireViewerForSubtree } from "@/server/auth/viewer";

/** Signed-out visitors get a real redirect to log in before the loading state streams. */
export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  await requireViewerForSubtree("/notifications");
  return children;
}
