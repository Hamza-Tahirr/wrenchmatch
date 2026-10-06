import type { ReactNode } from "react";

import { requireRoleForSubtree } from "@/server/auth/viewer";

/**
 * The whole /mechanic area is for mechanic accounts. Checked before the loading states
 * stream, so signed-out visitors get a real redirect to log in (and back to the exact page),
 * and other roles the access-denied page. Each page and action still checks for itself.
 */
export default async function MechanicAreaLayout({ children }: { children: ReactNode }) {
  await requireRoleForSubtree("mechanic", "/mechanic");
  return children;
}
