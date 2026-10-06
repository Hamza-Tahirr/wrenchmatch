// canViewFile / getViewableFile against the privacy matrix (ARCHITECTURE section 8): every
// file purpose for owner, other customer, matched / unmatched / suspended / booked mechanic,
// admin and signed-out visitors.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BookingStatus } from "@/lib/domain";
import type { Viewer } from "@/server/context";
import { newId } from "@/server/ids";
import { canViewFile, getViewableFile } from "@/server/storage/file-access";
import { createTestContext, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type TestMechanic,
  type TestRequest,
} from "../support/factories";

type Purpose =
  | "request_photo"
  | "request_video"
  | "mechanic_profile_photo"
  | "mechanic_document"
  | "user_avatar"
  | "mechanic_gallery"
  | "booking_photo";

const MIME: Record<Purpose, string> = {
  request_photo: "image/jpeg",
  request_video: "video/mp4",
  mechanic_profile_photo: "image/jpeg",
  mechanic_document: "application/pdf",
  user_avatar: "image/jpeg",
  mechanic_gallery: "image/jpeg",
  booking_photo: "image/jpeg",
};

let t: TestContext;
let owner: Viewer; // the customer whose request it is
let otherCustomer: Viewer;
let admin: Viewer;
let matched: TestMechanic; // approved and matched to the request
let unmatched: TestMechanic; // approved, not matched
let suspendedMatched: TestMechanic; // matched, but suspended
let request: TestRequest;

async function insertFile(ownerId: string, purpose: Purpose): Promise<string> {
  const id = newId();
  await t.ctx.db
    .insertInto("files")
    .values({
      id,
      owner_user_id: ownerId,
      purpose,
      storage_key: `test/${id}.bin`,
      mime_type: MIME[purpose],
      size_bytes: 1234,
      width: null,
      height: null,
      sha256: "0".repeat(64),
      metadata_stripped: MIME[purpose].startsWith("image/") ? 1 : 0,
      original_name: "secret-name.jpg",
      created_at: t.ctx.now.toISOString(),
    })
    .execute();
  return id;
}

async function requestMedia(requestId: string, kind: "photo" | "video", shareable: boolean): Promise<string> {
  const customerId = (
    await t.ctx.db.selectFrom("repair_requests").select("customer_id").where("id", "=", requestId).executeTakeFirstOrThrow()
  ).customer_id;
  const fileId = await insertFile(customerId, kind === "photo" ? "request_photo" : "request_video");
  await t.ctx.db
    .insertInto("request_media")
    .values({ file_id: fileId, request_id: requestId, kind, shareable_before_booking: shareable ? 1 : 0 })
    .execute();
  return fileId;
}

async function match(requestId: string, mechanicId: string): Promise<void> {
  await t.ctx.db
    .insertInto("job_matches")
    .values({
      id: newId(),
      request_id: requestId,
      mechanic_id: mechanicId,
      distance_miles: 3.2,
      rank: 1,
      notified_at: t.ctx.now.toISOString(),
    })
    .execute();
}

function setMechanicStatus(mechanicId: string, status: "approved" | "suspended"): void {
  t.sqlite
    .prepare("UPDATE mechanic_profiles SET status = ?, status_reason = ? WHERE user_id = ?")
    .run(status, status === "suspended" ? "Test suspension" : null, mechanicId);
}

type Expectation = readonly [label: string, viewer: Viewer | null, allowed: boolean];

async function expectAccess(fileId: string, expectations: readonly Expectation[]): Promise<void> {
  for (const [label, viewer, allowed] of expectations) {
    expect(await canViewFile(t.ctx, viewer, fileId), label).toBe(allowed);
    expect((await getViewableFile(t.ctx, viewer, fileId)) !== null, `${label} (getViewableFile)`).toBe(allowed);
  }
}

beforeEach(async () => {
  t = createTestContext();
  owner = await createUser(t.ctx, { role: "customer" });
  otherCustomer = await createUser(t.ctx, { role: "customer" });
  admin = await createUser(t.ctx, { role: "admin" });
  matched = await createMechanic(t.ctx);
  unmatched = await createMechanic(t.ctx);
  suspendedMatched = await createMechanic(t.ctx, { status: "suspended" });
  request = await createOpenRequest(t.ctx, owner);
  await match(request.id, matched.id);
  await match(request.id, suspendedMatched.id);
});

afterEach(async () => {
  await t.cleanup();
});

describe("request photos shared before booking", () => {
  it("follow the matrix: owner, matched approved mechanic and admin only", async () => {
    const photo = await requestMedia(request.id, "photo", true);
    await expectAccess(photo, [
      ["signed out", null, false],
      ["owner customer", owner, true],
      ["other customer", otherCustomer, false],
      ["matched approved mechanic", matched, true],
      ["unmatched mechanic", unmatched, false],
      ["matched but suspended mechanic", suspendedMatched, false],
      ["admin", admin, true],
    ]);
  });

  it("stop being visible to a matched mechanic while suspended", async () => {
    const photo = await requestMedia(request.id, "photo", true);
    setMechanicStatus(matched.id, "suspended");
    expect(await canViewFile(t.ctx, matched, photo)).toBe(false);
    setMechanicStatus(matched.id, "approved");
    expect(await canViewFile(t.ctx, matched, photo)).toBe(true);
  });

  it("are not visible to mechanics matched to a different request", async () => {
    const photo = await requestMedia(request.id, "photo", true);
    const otherRequest = await createOpenRequest(t.ctx, otherCustomer);
    await match(otherRequest.id, unmatched.id);
    expect(await canViewFile(t.ctx, unmatched, photo)).toBe(false);
  });
});

describe("request video and photos not marked shareable", () => {
  it("are hidden from matched mechanics before a confirmed booking", async () => {
    const video = await requestMedia(request.id, "video", false);
    const privatePhoto = await requestMedia(request.id, "photo", false);
    for (const fileId of [video, privatePhoto]) {
      await expectAccess(fileId, [
        ["signed out", null, false],
        ["owner customer", owner, true],
        ["other customer", otherCustomer, false],
        ["matched approved mechanic", matched, false],
        ["unmatched mechanic", unmatched, false],
        ["matched but suspended mechanic", suspendedMatched, false],
        ["admin", admin, true],
      ]);
    }
  });

  it("stay hidden while the reservation is only pending payment", async () => {
    const video = await requestMedia(request.id, "video", false);
    const photo = await requestMedia(request.id, "photo", true);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await createPendingBooking(t.ctx, { quote, customer: owner });
    expect(await canViewFile(t.ctx, matched, video)).toBe(false);
    expect(await canViewFile(t.ctx, matched, photo)).toBe(true);
  });
});

describe("media on a confirmed (demo) booking", () => {
  // A booking only becomes disputed after it was confirmed: the booked mechanic keeps the same
  // access (photos and video) as for confirmed/in-progress/completed, like the contact reveal.
  const visibleStatuses: readonly Exclude<BookingStatus, "pending_payment">[] = [
    "confirmed",
    "in_progress",
    "completed",
    "disputed",
  ];

  for (const status of visibleStatuses) {
    it(`is visible to the booked mechanic when the booking is ${status}`, async () => {
      const booked = await createMechanic(t.ctx);
      const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status });
      const video = await requestMedia(demo.request.id, "video", false);
      const unsharedPhoto = await requestMedia(demo.request.id, "photo", false);
      const sharedPhoto = await requestMedia(demo.request.id, "photo", true);
      for (const fileId of [video, unsharedPhoto, sharedPhoto]) {
        await expectAccess(fileId, [
          ["booked mechanic", booked, true],
          ["owner customer", owner, true],
          ["admin", admin, true],
          ["other customer", otherCustomer, false],
          ["mechanic matched to another request", matched, false],
          ["unmatched mechanic", unmatched, false],
          ["signed out", null, false],
        ]);
      }
    });
  }

  it("stays visible to the booked mechanic of a disputed booking, and to no other mechanic", async () => {
    const booked = await createMechanic(t.ctx);
    const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "disputed" });
    const video = await requestMedia(demo.request.id, "video", false);
    const unsharedPhoto = await requestMedia(demo.request.id, "photo", false);
    // Another approved mechanic matched to the disputed request (but not booked) sees only
    // what any matched mechanic sees before a booking: nothing that is not a shared photo.
    await match(demo.request.id, matched.id);
    for (const fileId of [video, unsharedPhoto]) {
      expect(await canViewFile(t.ctx, booked, fileId)).toBe(true);
      expect(await canViewFile(t.ctx, matched, fileId)).toBe(false);
    }
  });

  it("is hidden again once the booking is cancelled", async () => {
    const booked = await createMechanic(t.ctx);
    const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "cancelled" });
    const video = await requestMedia(demo.request.id, "video", false);
    expect(await canViewFile(t.ctx, booked, video)).toBe(false);
  });

  it("does not open the booked mechanic's access to the customer's other requests", async () => {
    const booked = await createMechanic(t.ctx);
    await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked });
    const otherVideo = await requestMedia(request.id, "video", false);
    expect(await canViewFile(t.ctx, booked, otherVideo)).toBe(false);
  });
});

describe("mechanic profile photos", () => {
  it("are visible to customers the mechanic quoted for, the mechanic and admins", async () => {
    const photo = await insertFile(matched.id, "mechanic_profile_photo");
    await t.ctx.db
      .updateTable("mechanic_profiles")
      .set({ profile_photo_file_id: photo })
      .where("user_id", "=", matched.id)
      .execute();
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });

    await expectAccess(photo, [
      ["signed out", null, false],
      ["customer who received a quote", owner, true],
      ["customer without a quote or booking", otherCustomer, false],
      ["the mechanic", matched, true],
      ["another mechanic", unmatched, false],
      ["admin", admin, true],
    ]);
  });

  it("are visible to customers booked with the mechanic", async () => {
    const booked = await createMechanic(t.ctx);
    const photo = await insertFile(booked.id, "mechanic_profile_photo");
    await t.ctx.db.updateTable("mechanic_profiles").set({ profile_photo_file_id: photo }).where("user_id", "=", booked.id).execute();
    await createDemoFixtureBooking(t.ctx, { customer: otherCustomer, mechanic: booked });
    expect(await canViewFile(t.ctx, otherCustomer, photo)).toBe(true);
    expect(await canViewFile(t.ctx, owner, photo)).toBe(false);
  });

  it("are not visible to customers when the mechanic has quoted no one", async () => {
    const photo = await insertFile(unmatched.id, "mechanic_profile_photo");
    await t.ctx.db.updateTable("mechanic_profiles").set({ profile_photo_file_id: photo }).where("user_id", "=", unmatched.id).execute();
    expect(await canViewFile(t.ctx, owner, photo)).toBe(false);
  });

  it("stay private to the mechanic and admins once replaced", async () => {
    const replaced = await insertFile(matched.id, "mechanic_profile_photo");
    const current = await insertFile(matched.id, "mechanic_profile_photo");
    await t.ctx.db.updateTable("mechanic_profiles").set({ profile_photo_file_id: current }).where("user_id", "=", matched.id).execute();
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await expectAccess(replaced, [
      ["customer who received a quote", owner, false],
      ["the mechanic", matched, true],
      ["admin", admin, true],
    ]);
    expect(await canViewFile(t.ctx, owner, current)).toBe(true);
  });
});

describe("mechanic documents", () => {
  async function documentFor(mechanic: TestMechanic): Promise<{ fileId: string; documentId: string }> {
    const fileId = await insertFile(mechanic.id, "mechanic_document");
    const documentId = newId();
    await t.ctx.db
      .insertInto("mechanic_documents")
      .values({ id: documentId, mechanic_id: mechanic.id, file_id: fileId, kind: "insurance", created_at: t.ctx.now.toISOString() })
      .execute();
    return { fileId, documentId };
  }

  const auditViews = () =>
    t.sqlite
      .prepare("SELECT actor_user_id, actor_role, action, entity_type, entity_id, metadata_json FROM audit_events")
      .all() as Record<string, string>[];

  it("are visible only to their owner and admins", async () => {
    const applicant = await createMechanic(t.ctx, { status: "applied" });
    const { fileId } = await documentFor(applicant);
    // Even a customer the mechanic has quoted for never sees the mechanic's documents.
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: applicant.id });
    await expectAccess(fileId, [
      ["signed out", null, false],
      ["owner mechanic", applicant, true],
      ["admin", admin, true],
      ["customer", owner, false],
      ["other customer", otherCustomer, false],
      ["another approved mechanic", matched, false],
    ]);
  });

  it("record an audit event for every admin view, and only for admin views", async () => {
    const applicant = await createMechanic(t.ctx, { status: "applied" });
    const { fileId, documentId } = await documentFor(applicant);

    expect(await canViewFile(t.ctx, admin, fileId)).toBe(true);
    expect(auditViews()).toHaveLength(0); // the policy check alone records nothing

    const viewed = await getViewableFile(t.ctx, admin, fileId);
    expect(viewed).toEqual({
      id: fileId,
      purpose: "mechanic_document",
      mimeType: "application/pdf",
      sizeBytes: 1234,
      storageKey: `test/${fileId}.bin`,
    });
    await getViewableFile(t.ctx, admin, fileId);
    await getViewableFile(t.ctx, applicant, fileId);
    await getViewableFile(t.ctx, owner, fileId);

    const events = auditViews();
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event).toMatchObject({
        actor_user_id: admin.id,
        actor_role: "admin",
        action: "mechanic_document.view",
        entity_type: "mechanic_document",
        entity_id: documentId,
      });
      expect(JSON.parse(event.metadata_json)).toEqual({ fileId, mechanicId: applicant.id, kind: "insurance" });
    }
  });
});

describe("customer profile pictures", () => {
  async function avatarFor(user: Viewer): Promise<string> {
    const fileId = await insertFile(user.id, "user_avatar");
    await t.ctx.db.updateTable("users").set({ avatar_file_id: fileId }).where("id", "=", user.id).execute();
    return fileId;
  }

  it("are hidden from mechanics before a confirmed booking: matched, quoting or pending payment", async () => {
    const avatar = await avatarFor(owner);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await createPendingBooking(t.ctx, { quote, customer: owner });
    await expectAccess(avatar, [
      ["signed out", null, false],
      ["the customer", owner, true],
      ["admin", admin, true],
      ["other customer", otherCustomer, false],
      ["matched mechanic with a quote and a pending reservation", matched, false],
      ["unmatched mechanic", unmatched, false],
    ]);
  });

  for (const status of ["confirmed", "in_progress", "completed", "disputed"] as const) {
    it(`are visible to the mechanic of a ${status} booking with that customer, and to no other mechanic`, async () => {
      const avatar = await avatarFor(owner);
      const booked = await createMechanic(t.ctx);
      await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status });
      await expectAccess(avatar, [
        ["booked mechanic", booked, true],
        ["matched mechanic", matched, false],
        ["unmatched mechanic", unmatched, false],
        ["other customer", otherCustomer, false],
      ]);
    });
  }

  it("are hidden again once that booking is cancelled, and a replaced picture stays private", async () => {
    const booked = await createMechanic(t.ctx);
    const cancelledFor = await createMechanic(t.ctx);
    await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: cancelledFor, status: "cancelled" });
    await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "confirmed" });
    const replaced = await avatarFor(owner);
    const current = await avatarFor(owner);
    expect(await canViewFile(t.ctx, cancelledFor, current)).toBe(false);
    expect(await canViewFile(t.ctx, booked, current)).toBe(true);
    expect(await canViewFile(t.ctx, booked, replaced)).toBe(false);
    expect(await canViewFile(t.ctx, owner, replaced)).toBe(true);
  });

  it("of other accounts are never shown to customers, and a mechanic's own picture stays private", async () => {
    const mechanicPicture = await avatarFor(matched);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await expectAccess(mechanicPicture, [
      ["the mechanic", matched, true],
      ["customer who received a quote", owner, false],
      ["another mechanic", unmatched, false],
      ["admin", admin, true],
    ]);
  });
});

describe("mechanic work gallery photos", () => {
  async function galleryPhoto(mechanic: TestMechanic): Promise<string> {
    const fileId = await insertFile(mechanic.id, "mechanic_gallery");
    await t.ctx.db
      .insertInto("mechanic_gallery")
      .values({ id: newId(), mechanic_id: mechanic.id, file_id: fileId, caption: null, sort_order: 0 })
      .execute();
    return fileId;
  }

  it("follow the profile-photo rule: customers the mechanic quoted for, the mechanic and admins", async () => {
    const photo = await galleryPhoto(matched);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await expectAccess(photo, [
      ["signed out", null, false],
      ["customer who received a quote", owner, true],
      ["customer without a quote or booking", otherCustomer, false],
      ["the mechanic", matched, true],
      ["another mechanic", unmatched, false],
      ["admin", admin, true],
    ]);
  });

  it("are visible to customers booked with the mechanic, not to customers the mechanic never quoted", async () => {
    const booked = await createMechanic(t.ctx);
    const photo = await galleryPhoto(booked);
    await createDemoFixtureBooking(t.ctx, { customer: otherCustomer, mechanic: booked, status: "completed" });
    expect(await canViewFile(t.ctx, otherCustomer, photo)).toBe(true);
    expect(await canViewFile(t.ctx, owner, photo)).toBe(false);
  });

  it("stay private once removed from the gallery", async () => {
    const orphan = await insertFile(matched.id, "mechanic_gallery");
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: matched.id });
    await expectAccess(orphan, [
      ["customer who received a quote", owner, false],
      ["the mechanic", matched, true],
      ["admin", admin, true],
    ]);
  });
});

describe("booking photos", () => {
  async function bookingPhoto(bookingId: string, uploader: Viewer): Promise<string> {
    const fileId = await insertFile(uploader.id, "booking_photo");
    await t.ctx.db
      .insertInto("booking_photos")
      .values({ id: newId(), booking_id: bookingId, file_id: fileId, uploaded_by: uploader.id, phase: "before" })
      .execute();
    return fileId;
  }

  it("are visible to the booking's customer and mechanic and to admins only", async () => {
    const booked = await createMechanic(t.ctx);
    const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "in_progress" });
    const byCustomer = await bookingPhoto(demo.id, owner);
    const byMechanic = await bookingPhoto(demo.id, booked);
    for (const fileId of [byCustomer, byMechanic]) {
      await expectAccess(fileId, [
        ["signed out", null, false],
        ["the booking's customer", owner, true],
        ["the booking's mechanic", booked, true],
        ["admin", admin, true],
        ["other customer", otherCustomer, false],
        ["mechanic matched to the customer's other request", matched, false],
        ["unmatched mechanic", unmatched, false],
      ]);
    }
  });

  it("leave the mechanic only their own photos once the booking is cancelled; the customer keeps all", async () => {
    const booked = await createMechanic(t.ctx);
    const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "confirmed" });
    const byCustomer = await bookingPhoto(demo.id, owner);
    const byMechanic = await bookingPhoto(demo.id, booked);
    t.sqlite.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'Test' WHERE id = ?").run(t.ctx.now.toISOString(), demo.id);
    expect(await canViewFile(t.ctx, booked, byCustomer)).toBe(false);
    expect(await canViewFile(t.ctx, booked, byMechanic)).toBe(true);
    expect(await canViewFile(t.ctx, owner, byMechanic)).toBe(true);
    expect(await canViewFile(t.ctx, owner, byCustomer)).toBe(true);
  });

  it("are not visible to the mechanic of the customer's other booking", async () => {
    const booked = await createMechanic(t.ctx);
    const otherBooked = await createMechanic(t.ctx);
    const demo = await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: booked, status: "completed" });
    await createDemoFixtureBooking(t.ctx, { customer: owner, mechanic: otherBooked, status: "completed" });
    const photo = await bookingPhoto(demo.id, owner);
    expect(await canViewFile(t.ctx, otherBooked, photo)).toBe(false);
  });
});

describe("files that are missing, unattached or addressed oddly", () => {
  it("unknown and malformed ids are refused for everyone, admins included", async () => {
    for (const id of [newId(), "", "../../etc/passwd", "x".repeat(65), "1; DROP TABLE files"]) {
      expect(await canViewFile(t.ctx, admin, id), id).toBe(false);
      expect(await getViewableFile(t.ctx, admin, id), id).toBeNull();
    }
  });

  it("an uploaded photo not yet attached to a request is visible only to its owner and admins", async () => {
    const orphan = await insertFile(owner.id, "request_photo");
    await expectAccess(orphan, [
      ["owner", owner, true],
      ["admin", admin, true],
      ["matched mechanic", matched, false],
      ["other customer", otherCustomer, false],
    ]);
  });
});
