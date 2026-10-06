import type { ReactNode } from "react";

import { requireRoleForSubtree } from "@/server/auth/viewer";

/** Signed-out visitors get a real redirect to log in before the loading state streams. */
export default async function BookingsLayout({ children }: { children: ReactNode }) {
  await requireRoleForSubtree("customer", "/bookings");
  return children;
}
