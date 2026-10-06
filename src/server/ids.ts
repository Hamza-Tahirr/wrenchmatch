import "server-only";

import { randomUUID } from "node:crypto";

/** New primary-key id (random UUID v4). Ids are never sequential, so they cannot be guessed. */
export function newId(): string {
  return randomUUID();
}
