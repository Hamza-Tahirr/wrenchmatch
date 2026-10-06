// Notification queries are scoped to their owner: listing, counting and marking as read
// never touch (or reveal) another user's notifications.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addMinutes } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { notify } from "@/server/notifications/notify";
import { listForViewer, markAllRead, markRead, unreadCount } from "@/server/notifications/queries";
import { createTestContext, withNow, type TestContext } from "../support/db";
import { createUser } from "../support/factories";

let t: TestContext;
let dana: Viewer;
let luis: Viewer;

beforeEach(async () => {
  t = createTestContext();
  dana = await createUser(t.ctx, { role: "customer" });
  luis = await createUser(t.ctx, { role: "mechanic" });
});

afterEach(async () => {
  await t.cleanup();
});

/** Writes `count` notifications for a user, one minute apart (the last is the newest). */
async function seed(user: Viewer, count: number, options: { start?: number; linkPath?: string } = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const minute = (options.start ?? 0) + index;
    const { notificationId } = await writeTx(t.ctx.db, (trx) =>
      notify(trx, {
        userId: user.id,
        type: "quote.received",
        title: `Update ${minute}`,
        body: `Body ${minute}`,
        linkPath: options.linkPath ?? `/requests/r-${minute}`,
        at: addMinutes(t.ctx.now, minute),
      }),
    );
    ids.push(notificationId);
  }
  return ids;
}

async function notFound(promise: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe("not_found");
}

describe("listForViewer", () => {
  it("returns only the viewer's notifications, newest first", async () => {
    await seed(dana, 3);
    await seed(luis, 2, { start: 10 });
    const page = await listForViewer(t.ctx, dana);
    expect(page.items.map((item) => item.title)).toEqual(["Update 2", "Update 1", "Update 0"]);
    expect(page).toMatchObject({ page: 1, pageSize: 20, totalCount: 3, totalPages: 1, unreadCount: 3 });
    expect(page.items[0]).toEqual({
      id: expect.any(String),
      type: "quote.received",
      title: "Update 2",
      body: "Body 2",
      linkPath: "/requests/r-2",
      createdAt: addMinutes(t.ctx.now, 2).toISOString(),
      readAt: null,
    });
    expect((await listForViewer(t.ctx, luis)).items.map((item) => item.title)).toEqual(["Update 11", "Update 10"]);
  });

  it("keeps insertion order for notifications written at the same instant", async () => {
    await writeTx(t.ctx.db, async (trx) => {
      for (const title of ["first", "second", "third"]) {
        await notify(trx, { userId: dana.id, type: "account.welcome", title, body: "", at: t.ctx.now });
      }
    });
    expect((await listForViewer(t.ctx, dana)).items.map((item) => item.title)).toEqual(["third", "second", "first"]);
  });

  it("pages through results and clamps out-of-range pages", async () => {
    await seed(dana, 25);
    const first = await listForViewer(t.ctx, dana, { page: 1 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.title).toBe("Update 24");
    expect(first).toMatchObject({ totalCount: 25, totalPages: 2 });

    const second = await listForViewer(t.ctx, dana, { page: 2 });
    expect(second.items.map((item) => item.title)).toEqual(["Update 4", "Update 3", "Update 2", "Update 1", "Update 0"]);

    expect((await listForViewer(t.ctx, dana, { page: 99 })).page).toBe(2);
    expect((await listForViewer(t.ctx, dana, { page: -3 })).page).toBe(1);
    expect((await listForViewer(t.ctx, dana, { page: 2, pageSize: 10 })).items).toHaveLength(10);
    expect((await listForViewer(t.ctx, dana, { pageSize: 500 })).pageSize).toBe(50);
  });

  it("describes an empty list as page 1 of 1", async () => {
    expect(await listForViewer(t.ctx, dana)).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 1,
      unreadCount: 0,
    });
  });
});

describe("unreadCount", () => {
  it("counts only the viewer's unread notifications", async () => {
    const [first] = await seed(dana, 3);
    await seed(luis, 4);
    await markRead(t.ctx, dana, first ?? "");
    expect(await unreadCount(t.ctx, dana)).toBe(2);
    expect(await unreadCount(t.ctx, luis)).toBe(4);
  });
});

describe("markRead", () => {
  it("marks the viewer's own notification, keeps the first read time and returns its link", async () => {
    const [id] = await seed(dana, 1, { linkPath: "/requests/abc" });
    const notificationId = id ?? "";
    expect(await markRead(t.ctx, dana, notificationId)).toEqual({ linkPath: "/requests/abc" });
    await markRead(withNow(t.ctx, addMinutes(t.ctx.now, 30)), dana, notificationId);
    const [item] = (await listForViewer(t.ctx, dana)).items;
    expect(item?.readAt).toBe(t.ctx.now.toISOString());
  });

  it("treats another user's notification exactly like a missing one, and leaves it unread", async () => {
    const [luisNotification] = await seed(luis, 1);
    await notFound(markRead(t.ctx, dana, luisNotification ?? ""));
    await notFound(markRead(t.ctx, dana, "00000000-0000-4000-8000-000000000000"));
    expect(await unreadCount(t.ctx, luis)).toBe(1);
  });
});

describe("markAllRead", () => {
  it("marks every unread notification of the viewer and nobody else's", async () => {
    await seed(dana, 3);
    await seed(luis, 2);
    expect(await markAllRead(t.ctx, dana)).toBe(3);
    expect(await markAllRead(t.ctx, dana)).toBe(0);
    expect(await unreadCount(t.ctx, dana)).toBe(0);
    expect(await unreadCount(t.ctx, luis)).toBe(2);
    expect((await listForViewer(t.ctx, dana)).items.every((item) => item.readAt === t.ctx.now.toISOString())).toBe(true);
  });
});
