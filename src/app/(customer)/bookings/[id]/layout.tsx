import type { ReactNode } from "react";

import { requireRoleForSubtree } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { assertOwnBooking } from "@/server/customer/ownership";

import { loadOr404, recordIdOr404 } from "../../_lib/load";

/**
 * Access check before anything streams (the page has a loading state): signed-out visitors
 * get a real redirect to log in, and a booking that isn't the viewer's a real 404.
 */
export default async function BookingLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const id = recordIdOr404((await params).id);
  const viewer = await requireRoleForSubtree("customer", `/bookings/${id}`);
  await loadOr404(() => assertOwnBooking(createAppContext(), viewer, id));
  return children;
}
