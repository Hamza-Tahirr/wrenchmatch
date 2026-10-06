import type { ReactNode } from "react";

import { requireRoleForSubtree } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { assertOwnRequest } from "@/server/customer/ownership";

import { loadOr404, recordIdOr404 } from "../../_lib/load";

/**
 * Access check before anything streams (the pages below have loading states): signed-out
 * visitors get a real redirect to log in, and a request that isn't the viewer's a real 404.
 */
export default async function RequestLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const id = recordIdOr404((await params).id);
  const viewer = await requireRoleForSubtree("customer", `/requests/${id}`);
  await loadOr404(() => assertOwnRequest(createAppContext(), viewer, id));
  return children;
}
