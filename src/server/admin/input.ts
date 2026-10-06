import "server-only";

import type { z } from "zod";

import { adminFieldErrors, recordIdSchema } from "@/lib/validation/admin";
import { DomainError } from "@/server/errors";

/**
 * Validates a domain function's input with its schema from src/lib/validation/admin.ts
 * (the same one the Server Action used). Throws DomainError("invalid_input") with the
 * first message and `details.fieldErrors` keyed by form field name.
 */
export function parseAdminInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message ?? "Check the details and try again.";
  throw new DomainError("invalid_input", message, { fieldErrors: adminFieldErrors(result.error) });
}

/**
 * The id of a record page (from the URL). An id that cannot exist is reported like a
 * missing record, DomainError("not_found") with `notFoundMessage`, so pages simply 404.
 */
export function parseRecordId(id: unknown, notFoundMessage: string): string {
  const result = recordIdSchema.safeParse(id);
  if (!result.success) throw new DomainError("not_found", notFoundMessage);
  return result.data;
}
