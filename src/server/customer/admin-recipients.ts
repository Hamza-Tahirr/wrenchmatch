import "server-only";

import type { Tx } from "@/server/db/tx";

/** Ids of admin accounts that can act on alerts (not disabled), oldest first. */
export async function activeAdminIds(trx: Tx): Promise<string[]> {
  const rows = await trx
    .selectFrom("users")
    .select("id")
    .where("role", "=", "admin")
    .where("disabled_at", "is", null)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => row.id);
}
