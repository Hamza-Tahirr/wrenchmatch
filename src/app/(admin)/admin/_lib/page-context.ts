import "server-only";

import { cache } from "react";

import { getAdminShell, type AdminShellInfo } from "@/server/admin/counts";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext, type AppContext, type Viewer } from "@/server/context";

// Every admin page and layout starts here: requireRole("admin") is the page's own check
// (layouts are not a security boundary), and the admin domain functions check again.

export type AdminPageContext = {
  viewer: Viewer;
  ctx: AppContext;
  /** Navigation counts and the time zone admin pages show times in. */
  shell: AdminShellInfo;
};

// One query per request, shared by the layout and the page when both render.
const loadShell = cache(async (viewer: Viewer): Promise<AdminShellInfo> => getAdminShell(createAppContext(), viewer));

/**
 * The signed-in admin for a page at `path` (signed-out visitors go to the login page and
 * come back; other roles see the access-denied page), a fresh AppContext and the shell info.
 */
export async function adminPage(path: string): Promise<AdminPageContext> {
  const viewer = await requireRole("admin", path);
  return { viewer, ctx: createAppContext(), shell: await loadShell(viewer) };
}
