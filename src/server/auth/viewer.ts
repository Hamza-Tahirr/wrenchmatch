import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { UserRole } from "@/lib/domain";
import { REQUEST_PATH_HEADER } from "@/lib/request-path";
import { createAppContext, type Viewer } from "@/server/context";
import { accessDeniedPath, loginPath, sanitizeNextPath } from "./redirects";
import { lookupSession, readSessionCookie } from "./session";

export type { Viewer } from "@/server/context";

/**
 * The signed-in user for the current request, or null. Reads the session cookie and the
 * database once per render (React cache). Works in Server Components, Server Actions and
 * Route Handlers.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return lookupSession(createAppContext(), token);
});

/**
 * The signed-in user; redirects signed-out visitors to /login?next=<nextPath> so they come
 * back after logging in. Pass the current page's path (e.g. `/requests/${id}`).
 */
export async function requireViewer(nextPath?: string | null): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(loginPath(nextPath));
  return viewer;
}

/**
 * The signed-in user when their role is one of `roles`. Signed-out visitors go to the
 * login page; signed-in users with another role go to /access-denied?need=<role>, which
 * explains which kind of account the page needs. Domain functions still re-check roles
 * and ownership themselves.
 *
 *   const viewer = await requireRole("customer", "/quotes");
 *   const viewer = await requireRole(["mechanic"], `/mechanic/jobs/${requestId}`);
 */
export async function requireRole(roles: UserRole | readonly UserRole[], nextPath?: string | null): Promise<Viewer> {
  const allowed: readonly UserRole[] = typeof roles === "string" ? [roles] : roles;
  const viewer = await requireViewer(nextPath);
  if (!allowed.includes(viewer.role)) redirect(accessDeniedPath(allowed, nextPath));
  return viewer;
}

/**
 * The requested page's path and query, as forwarded by src/proxy.ts for the protected areas,
 * or `fallbackPath` when the header is missing or not a safe same-site path. Only a redirect
 * target, never an authorization input.
 */
export async function currentRequestPath(fallbackPath: string): Promise<string> {
  const forwarded = (await headers()).get(REQUEST_PATH_HEADER);
  return sanitizeNextPath(forwarded) ?? fallbackPath;
}

/**
 * requireRole for a layout that protects a whole subtree. It runs before the subtree's
 * loading states stream, so signed-out visitors get a real 307 to /login?next=<the exact
 * page> and other roles a 307 to /access-denied (a page-level redirect under loading.tsx
 * could only happen on the client after an HTTP 200).
 */
export async function requireRoleForSubtree(
  roles: UserRole | readonly UserRole[],
  fallbackPath: string,
): Promise<Viewer> {
  return requireRole(roles, await currentRequestPath(fallbackPath));
}

/** requireViewer for a layout that protects a whole subtree (any signed-in role). */
export async function requireViewerForSubtree(fallbackPath: string): Promise<Viewer> {
  return requireViewer(await currentRequestPath(fallbackPath));
}
