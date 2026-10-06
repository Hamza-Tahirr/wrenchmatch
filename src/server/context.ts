import "server-only";

import type { Kysely } from "kysely";

import type { UserRole } from "@/lib/domain";
import { getDb } from "@/server/db/client";
import type { DB } from "@/server/db/schema.generated";
import { createAppFileStorage } from "@/server/storage/app-storage";
import type { FileStorage } from "@/server/storage/types";

/** The signed-in user a domain function acts for (obtained via requireRole in auth/viewer.ts). */
export type Viewer = {
  id: string;
  role: UserRole;
  email: string;
  displayName: string;
};

/** Everything a domain function may touch besides its input. Tests build their own. */
export type AppContext = {
  db: Kysely<DB>;
  /** The request's clock. Domain code never calls new Date() / Date.now() itself. */
  now: Date;
  storage: FileStorage;
};

let storage: FileStorage | undefined;

/**
 * A context for one request or Server Action: the shared database, the current time and the
 * upload storage (UPLOAD_DIR locally, Vercel Blob when configured; see storage/app-storage.ts).
 */
export function createAppContext(): AppContext {
  storage ??= createAppFileStorage();
  return { db: getDb(), now: new Date(), storage };
}
