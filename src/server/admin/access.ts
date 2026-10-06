import "server-only";

import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";

/**
 * First line of every admin query and command (defense in depth: pages and Server Actions
 * also call requireRole("admin")). Runs before any input is read or any row is touched.
 */
export function assertAdmin(viewer: Viewer): void {
  if (!viewer || viewer.role !== "admin") {
    throw new DomainError("forbidden", "Only admins can use the admin dashboard.");
  }
}
