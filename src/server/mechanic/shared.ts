import "server-only";

import type { Kysely } from "kysely";
import type { z } from "zod";

import { formatDate } from "@/lib/format";
import type { AvailabilityWindowInput } from "@/lib/validation/mechanic";
import type { DB } from "@/server/db/schema.generated";
import type { Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";

import type { Message } from "./messages";

// Reads and writes shared by the application and profile commands. Write helpers take the
// writeTx handle; read helpers accept ctx.db or a trx.

/** DomainError("invalid_input") that also names the form field, for useActionState forms. */
export function invalidField(field: string, message: string): DomainError {
  return new DomainError("invalid_input", message, { fieldErrors: { [field]: [message] } });
}

/**
 * A typed command failed its schema: the caller skipped (or mis-built) the form parse.
 * `details.fieldErrors` uses the command's field paths.
 */
export function invalidCommand(error: z.ZodError, message = "Some details are missing or invalid. Check the form and try again."): DomainError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return new DomainError("invalid_input", message, { fieldErrors });
}

/**
 * The field errors a mechanic command attached to its DomainError (keyed by form input name,
 * e.g. { earliestStart: [...] }), for a Server Action's form state. Undefined otherwise.
 */
export function domainFieldErrors(error: unknown): Record<string, string[]> | undefined {
  if (!(error instanceof DomainError)) return undefined;
  const value = error.details?.fieldErrors;
  if (typeof value !== "object" || value === null) return undefined;
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) result[field] = messages.filter((message): message is string => typeof message === "string");
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Parses a typed command with its schema, throwing invalidCommand on failure. */
export function parseCommand<T>(schema: z.ZodType<T>, input: unknown, message?: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalidCommand(result.error, message);
  return result.data;
}

export type ZipInfo = { zip: string; city: string; state: string; lat: number; lng: number; timeZone: string };

export async function loadZip(db: Kysely<DB>, zip: string): Promise<ZipInfo | null> {
  const row = await db
    .selectFrom("zip_centroids")
    .select(["zip", "city", "state", "lat", "lng", "time_zone"])
    .where("zip", "=", zip)
    .executeTakeFirst();
  return row ? { zip: row.zip, city: row.city, state: row.state, lat: row.lat, lng: row.lng, timeZone: row.time_zone } : null;
}

/** The base ZIP must have a centroid (it need not be a pilot ZIP). */
export async function requireBaseZip(db: Kysely<DB>, zip: string): Promise<ZipInfo> {
  const info = await loadZip(db, zip);
  if (!info) {
    throw invalidField(
      "baseZip",
      `We don't have location data for ZIP ${zip} yet, so we can't measure distances from it. Enter a nearby ZIP code.`,
    );
  }
  return info;
}

/** Insurance must still be valid after today (in the base ZIP's time zone) when it is saved. */
export function assertInsuranceInFuture(expiresOn: string, todayLocal: string): void {
  if (expiresOn <= todayLocal) {
    throw invalidField(
      "insuranceExpiresOn",
      `Enter an insurance expiry date after today (${formatDate(todayLocal)}). Expired policies can't be accepted.`,
    );
  }
}

export type CategoryInfo = { id: string; name: string; safetySensitive: boolean; enabled: boolean };

export async function loadCategories(db: Kysely<DB>): Promise<CategoryInfo[]> {
  const rows = await db
    .selectFrom("service_categories")
    .select(["id", "name", "safety_sensitive", "enabled"])
    .orderBy("sort_order")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    safetySensitive: row.safety_sensitive === 1,
    enabled: row.enabled === 1,
  }));
}

/**
 * The chosen categories. Each must be enabled, except categories in `alreadyOffered`: a
 * mechanic keeps a service an admin has since disabled until they remove it.
 */
export async function resolveCategories(
  db: Kysely<DB>,
  ids: readonly string[],
  alreadyOffered: ReadonlySet<string> = new Set(),
): Promise<CategoryInfo[]> {
  const byId = new Map((await loadCategories(db)).map((category) => [category.id, category]));
  const chosen: CategoryInfo[] = [];
  for (const id of ids) {
    const category = byId.get(id);
    if (!category || (!category.enabled && !alreadyOffered.has(id))) {
      throw invalidField(
        "services",
        category
          ? `${category.name} isn't offered in the pilot right now. Remove it and try again.`
          : "One of the chosen services doesn't exist. Refresh the page and choose again.",
      );
    }
    chosen.push(category);
  }
  return chosen;
}

/**
 * Replaces the mechanic's services. Kept categories keep their safety approval; added ones
 * start unapproved (safety-sensitive work then waits for an admin safety review).
 */
export async function replaceServices(
  trx: Tx,
  mechanicId: string,
  categoryIds: readonly string[],
): Promise<{ added: string[]; removed: string[] }> {
  const existing = new Set(
    (
      await trx.selectFrom("mechanic_services").select("category_id").where("mechanic_id", "=", mechanicId).execute()
    ).map((row) => row.category_id),
  );
  const wanted = new Set(categoryIds);
  const added = categoryIds.filter((id) => !existing.has(id));
  const removed = [...existing].filter((id) => !wanted.has(id));
  if (removed.length > 0) {
    await trx
      .deleteFrom("mechanic_services")
      .where("mechanic_id", "=", mechanicId)
      .where("category_id", "in", removed)
      .execute();
  }
  if (added.length > 0) {
    await trx
      .insertInto("mechanic_services")
      .values(
        added.map((categoryId) => ({
          mechanic_id: mechanicId,
          category_id: categoryId,
          safety_approved: 0,
          safety_approved_by: null,
          safety_approved_at: null,
        })),
      )
      .execute();
  }
  return { added, removed };
}

export async function replaceMakes(
  trx: Tx,
  mechanicId: string,
  allMakes: boolean,
  makes: readonly string[],
): Promise<void> {
  await trx.deleteFrom("mechanic_makes").where("mechanic_id", "=", mechanicId).execute();
  if (!allMakes && makes.length > 0) {
    await trx
      .insertInto("mechanic_makes")
      .values(makes.map((make) => ({ mechanic_id: mechanicId, make })))
      .execute();
  }
}

export async function replaceAvailability(
  trx: Tx,
  mechanicId: string,
  windows: readonly AvailabilityWindowInput[],
): Promise<void> {
  await trx.deleteFrom("mechanic_availability").where("mechanic_id", "=", mechanicId).execute();
  if (windows.length > 0) {
    await trx
      .insertInto("mechanic_availability")
      .values(
        windows.map((window) => ({
          id: newId(),
          mechanic_id: mechanicId,
          weekday: window.weekday,
          start_minute: window.startMinute,
          end_minute: window.endMinute,
        })),
      )
      .execute();
  }
}

/** Sends `message` to every active admin account. Returns how many were notified. */
export async function notifyAdmins(trx: Tx, message: Message, at: Date): Promise<number> {
  const admins = await trx
    .selectFrom("users")
    .select("id")
    .where("role", "=", "admin")
    .where("disabled_at", "is", null)
    .orderBy("id")
    .execute();
  for (const admin of admins) {
    await notify(trx, { userId: admin.id, ...message, at });
  }
  return admins.length;
}
