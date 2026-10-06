import "server-only";

import type { Kysely } from "kysely";

import type { DB } from "@/server/db/schema.generated";

// The application checklist shown on the profile and required before a resubmission.

export type ChecklistKey = "base_zip" | "insurance" | "id_document" | "insurance_document" | "services" | "availability";

export type ChecklistItem = { key: ChecklistKey; label: string; done: boolean; hint: string };

export type ApplicationChecklist = { items: ChecklistItem[]; doneCount: number; complete: boolean };

export type ChecklistInput = {
  baseZip: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresOn: string | null;
  /** Today in the base ZIP's time zone. */
  todayLocal: string;
  documents: readonly { kind: string; status: string }[];
  serviceCount: number;
  availabilityCount: number;
};

/** A document counts once uploaded unless an admin rejected it. */
const hasDocument = (input: ChecklistInput, kind: string) =>
  input.documents.some((document) => document.kind === kind && document.status !== "rejected");

export function applicationChecklist(input: ChecklistInput): ApplicationChecklist {
  const items: ChecklistItem[] = [
    {
      key: "base_zip",
      label: "Base ZIP code",
      done: Boolean(input.baseZip),
      hint: "Distances to jobs are measured from your base ZIP.",
    },
    {
      key: "insurance",
      label: "Insurance details",
      done: Boolean(
        input.insuranceProvider?.trim() &&
          input.insurancePolicyNumber?.trim() &&
          input.insuranceExpiresOn &&
          input.insuranceExpiresOn > input.todayLocal,
      ),
      hint: "Provider, policy number and an expiry date after today.",
    },
    {
      key: "id_document",
      label: "Photo ID uploaded",
      done: hasDocument(input, "id_document"),
      hint: "A driver's license or other government photo ID (upload a new one if it was rejected).",
    },
    {
      key: "insurance_document",
      label: "Insurance certificate uploaded",
      done: hasDocument(input, "insurance"),
      hint: "Proof of liability insurance showing the provider and expiry date.",
    },
    {
      key: "services",
      label: "At least one service",
      done: input.serviceCount > 0,
      hint: "Choose the repair categories you offer.",
    },
    {
      key: "availability",
      label: "Weekly availability",
      done: input.availabilityCount > 0,
      hint: "Add at least one weekly time window when you can take jobs.",
    },
  ];
  const doneCount = items.filter((item) => item.done).length;
  return { items, doneCount, complete: doneCount === items.length };
}

/** Loads the checklist inputs for a mechanic (profile fields come from the caller). */
export async function loadChecklistCounts(
  db: Kysely<DB>,
  mechanicId: string,
): Promise<Pick<ChecklistInput, "documents" | "serviceCount" | "availabilityCount" | "insurancePolicyNumber">> {
  const documents = await db
    .selectFrom("mechanic_documents")
    .select(["kind", "status"])
    .where("mechanic_id", "=", mechanicId)
    .execute();
  const services = await db
    .selectFrom("mechanic_services")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("mechanic_id", "=", mechanicId)
    .executeTakeFirstOrThrow();
  const availability = await db
    .selectFrom("mechanic_availability")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("mechanic_id", "=", mechanicId)
    .executeTakeFirstOrThrow();
  const privateRow = await db
    .selectFrom("mechanic_private")
    .select("insurance_policy_number")
    .where("user_id", "=", mechanicId)
    .executeTakeFirst();
  return {
    documents,
    serviceCount: Number(services.count),
    availabilityCount: Number(availability.count),
    insurancePolicyNumber: privateRow?.insurance_policy_number ?? null,
  };
}
