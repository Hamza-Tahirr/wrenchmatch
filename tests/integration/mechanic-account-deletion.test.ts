// "Request account deletion" on the mechanic profile: the dialog's form is parsed and sent to
// the shared help-desk command (requestAccountDeletion) the way requestAccountDeletionAction
// does; it opens an account help request, the admins are notified and nothing is deleted.
// getAccountDeletionRequest (src/server/mechanic/account-deletion.ts) tells the profile
// whether one is open, counting only the mechanic's own open deletion request.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { accountDeletionMessage, parseAccountDeletionForm } from "@/lib/validation/support";
import type { Viewer } from "@/server/context";
import { DomainError } from "@/server/errors";
import { getAccountDeletionRequest } from "@/server/mechanic/account-deletion";
import { createSupportRequest, requestAccountDeletion } from "@/server/support/requests";
import { createTestContext, type TestContext } from "../support/db";
import { createMechanic, createUser, type TestMechanic } from "../support/factories";

let t: TestContext;
let mechanic: TestMechanic;
let rival: TestMechanic;
let admin: Viewer;

function count(query: string, ...params: unknown[]): number {
  return (t.sqlite.prepare(query).get(...params) as { n: number }).n;
}

beforeEach(async () => {
  t = createTestContext();
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
  rival = await createMechanic(t.ctx, { displayName: "Rival Garage" });
  admin = await createUser(t.ctx, { role: "admin", displayName: "Avery" });
});

afterEach(async () => {
  await t.cleanup();
});

describe("mechanic account deletion request", () => {
  it("opens one account help request, notifies the admins and deletes nothing", async () => {
    expect(await getAccountDeletionRequest(t.ctx, mechanic)).toBeNull();
    // An ordinary account question is not a deletion request.
    await createSupportRequest(t.ctx, mechanic, { topic: "account", message: "How do I change my display name?" });
    expect(await getAccountDeletionRequest(t.ctx, mechanic)).toBeNull();

    // The profile dialog posts one optional "details" field.
    const form = new FormData();
    form.set("details", "  Retiring at the end of the month.  ");
    const parsed = parseAccountDeletionForm(form);
    if (!parsed.ok) throw new Error("The dialog's form should parse");
    const first = await requestAccountDeletion(t.ctx, mechanic, parsed.data);
    expect(first.alreadyRequested).toBe(false);
    expect(t.sqlite.prepare("SELECT message FROM support_requests WHERE id = ?").get(first.supportRequestId)).toEqual({
      message: accountDeletionMessage("Retiring at the end of the month."),
    });
    expect(await getAccountDeletionRequest(t.ctx, mechanic)).toEqual({
      supportRequestId: first.supportRequestId,
      createdAt: t.ctx.now.toISOString(),
      timeZone: expect.any(String),
    });
    // Asking again while it is open returns the same request instead of a duplicate.
    const empty = parseAccountDeletionForm(new FormData());
    if (!empty.ok) throw new Error("An empty dialog should parse");
    expect(await requestAccountDeletion(t.ctx, mechanic, empty.data)).toEqual({
      supportRequestId: first.supportRequestId,
      alreadyRequested: true,
    });
    expect(count("SELECT count(*) AS n FROM support_requests WHERE user_id = ? AND topic = 'account'", mechanic.id)).toBe(2);

    expect(t.sqlite.prepare("SELECT role, topic, status FROM support_requests WHERE id = ?").get(first.supportRequestId)).toEqual({
      role: "mechanic",
      topic: "account",
      status: "open",
    });
    expect(count("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND type = 'support.created'", admin.id)).toBe(2);
    // Nothing is deleted or disabled: the account, profile and status are untouched.
    expect(count("SELECT count(*) AS n FROM users WHERE id = ?", mechanic.id)).toBe(1);
    expect(t.sqlite.prepare("SELECT status, accepting_jobs FROM mechanic_profiles WHERE user_id = ?").get(mechanic.id)).toEqual({
      status: "approved",
      accepting_jobs: 1,
    });

    // Another mechanic's request never shows on this profile.
    await requestAccountDeletion(t.ctx, rival, {});
    expect((await getAccountDeletionRequest(t.ctx, mechanic))?.supportRequestId).toBe(first.supportRequestId);

    // Once the help desk resolves it, the profile offers the button again.
    t.sqlite
      .prepare("UPDATE support_requests SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution_note = 'Handled.' WHERE id = ?")
      .run(admin.id, t.ctx.now.toISOString(), first.supportRequestId);
    expect(await getAccountDeletionRequest(t.ctx, mechanic)).toBeNull();
  });

  it("is only for mechanic accounts", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    await expect(getAccountDeletionRequest(t.ctx, customer)).rejects.toBeInstanceOf(DomainError);
    await expect(getAccountDeletionRequest(t.ctx, admin)).rejects.toMatchObject({ code: "forbidden" });
  });
});
