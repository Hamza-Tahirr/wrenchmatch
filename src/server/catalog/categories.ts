import "server-only";

import type { Kysely } from "kysely";

import type { AppContext } from "@/server/context";
import type { DB } from "@/server/db/schema.generated";

// Service categories customers can choose (admins enable/disable them in settings).

export type CategoryOption = {
  id: string;
  name: string;
  shortDescription: string;
  /** Extra guidance shown with the category, e.g. "A code read is not a full diagnosis..." */
  customerNotice: string | null;
  /** Brake and suspension work: only mechanics an admin safety-approved receive these requests. */
  safetySensitive: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  short_description: string;
  customer_notice: string | null;
  safety_sensitive: number;
};

function toOption(row: CategoryRow): CategoryOption {
  return {
    id: row.id,
    name: row.name,
    shortDescription: row.short_description,
    customerNotice: row.customer_notice,
    safetySensitive: row.safety_sensitive === 1,
  };
}

function enabledCategories(db: Kysely<DB>) {
  return db
    .selectFrom("service_categories")
    .select(["id", "name", "short_description", "customer_notice", "safety_sensitive"])
    .where("enabled", "=", 1);
}

/** Enabled categories in display order (the request form's choices). */
export async function listEnabledCategories(ctx: Pick<AppContext, "db">): Promise<CategoryOption[]> {
  const rows = await enabledCategories(ctx.db).orderBy("sort_order").orderBy("id").execute();
  return rows.map(toOption);
}

/**
 * What helps a mechanic quote each kind of repair (MVP_PLAN section 4: the vehicle details
 * each category needs, beyond the year, make, model and mileage every request has). Shown
 * on the request form under the chosen category.
 */
const QUOTE_HINTS: Readonly<Record<string, string>> = {
  diagnostic_visit:
    "What you notice (a noise, smell, leak, vibration or warning light), when it happens and since when.",
  cel_code_read:
    "Whether the light is steady or flashing, any other symptoms, and the code if a store already read it.",
  battery_replacement:
    "How old the battery is, if you know, and the size or group number on its label (for example H6 or 24F).",
  battery_no_start:
    "What happens when you turn the key or press start (clicking, slow cranking or nothing) and whether a jump start helps.",
  oil_change:
    "The engine size and the oil your owner's manual lists (for example 0W-20 synthetic), plus the mileage of the last change.",
  filters: "Which filters you need (engine air, cabin air or both) and when they were last changed.",
  bulbs: "Which light is out (for example the front left headlight or the third brake light) and the bulb type, if you know it.",
  wipers: "Front, rear or both blades, and the sizes if you know them (they're in the owner's manual).",
  basic_maintenance: "The service you're due for (for example the 60,000-mile service) and anything your manual lists for it.",
  minor_engine_sensor:
    "Any warning lights or codes, the engine size, and what the car does (rough idle, misfires, poor fuel economy).",
  brake_work:
    "Which wheels, if you know, any squeal or grinding, how the pedal feels, and when the brakes were last done.",
  suspension_work: "Clunks or knocks over bumps, pulling or uneven tire wear, and which corner of the car it seems to come from.",
};

const DEFAULT_QUOTE_HINT = "What you've noticed, when it happens and anything that has already been tried.";

/** The "what helps us quote" hint for a category (a general one for categories without their own). */
export function quoteHintFor(categoryId: string): string {
  return QUOTE_HINTS[categoryId] ?? DEFAULT_QUOTE_HINT;
}

/** The category when it exists and is enabled; works on `ctx.db` or inside a transaction. */
export async function findEnabledCategory(db: Kysely<DB>, categoryId: string): Promise<CategoryOption | undefined> {
  const row = await enabledCategories(db).where("id", "=", categoryId).executeTakeFirst();
  return row ? toOption(row) : undefined;
}
