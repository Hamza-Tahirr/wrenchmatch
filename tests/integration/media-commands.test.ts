// The media commands and queries of docs/MEDIA.md (src/server/media): profile pictures, photos
// added to a request, the mechanic work gallery and booking photos. Role and ownership checks,
// limits, notifications, audit, stored bytes, and that lists agree with canViewFile.
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MEDIA_LIMITS, type UploadPurpose } from "@/server/config";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";
import { getHeaderAvatarSrc, getMyAvatar, getVisibleAvatarSrc, removeMyAvatar, setMyAvatar } from "@/server/media/avatar";
import { addBookingPhotos, getBookingPhotos, removeBookingPhoto } from "@/server/media/booking-photos";
import {
  addGalleryPhotos,
  getMyGalleryOverview,
  listMechanicGallery,
  moveGalleryPhoto,
  removeGalleryPhoto,
  reorderGallery,
  updateGalleryCaption,
} from "@/server/media/gallery";
import { addRequestPhotos, getRequestPhotoAllowance, listRequestPhotos } from "@/server/media/request-photos";
import { consumePictureAllowance, normalizeCaption, type MediaUpload } from "@/server/media/shared";
import { canViewFile } from "@/server/storage/file-access";
import { prepareUpload } from "@/server/storage/uploads";
import { createTestContext, withNow, type TestContext } from "../support/db";
import {
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  type TestMechanic,
} from "../support/factories";

// ---------------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------------

let source: Buffer;
const uploadsByPurpose = new Map<UploadPurpose, MediaUpload>();

beforeAll(async () => {
  // A small real JPEG carrying GPS EXIF, which every stored picture must lose.
  source = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 140, b: 210 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 27/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "112/1 4/1 9/1" } })
    .toBuffer();
  for (const purpose of ["user_avatar", "request_photo", "mechanic_gallery", "booking_photo"] as const) {
    uploadsByPurpose.set(purpose, {
      prepared: await prepareUpload({ bytes: source, name: "IMG_2041.jpg", size: source.byteLength }, purpose),
      originalName: "IMG_2041.jpg",
    });
  }
});

function pictures(purpose: UploadPurpose, count = 1): MediaUpload[] {
  const upload = uploadsByPurpose.get(purpose);
  if (!upload) throw new Error(`no fixture for ${purpose}`);
  return Array.from({ length: count }, () => upload);
}

let t: TestContext;
let customer: Viewer;
let otherCustomer: Viewer;
let admin: Viewer;
let mechanic: TestMechanic;
let otherMechanic: TestMechanic;

beforeEach(async () => {
  t = createTestContext();
  customer = await createUser(t.ctx, { role: "customer", displayName: "Dana Driver" });
  otherCustomer = await createUser(t.ctx, { role: "customer" });
  admin = await createUser(t.ctx, { role: "admin" });
  mechanic = await createMechanic(t.ctx, { displayName: "Marco R." });
  otherMechanic = await createMechanic(t.ctx, { displayName: "Luis" });
});

afterEach(async () => {
  await t.cleanup();
});

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("expected a DomainError");
}

const fileRow = (id: string) =>
  t.sqlite.prepare("SELECT purpose, owner_user_id, storage_key, metadata_stripped, width, height FROM files WHERE id = ?").get(id) as
    | { purpose: string; owner_user_id: string; storage_key: string; metadata_stripped: number; width: number; height: number }
    | undefined;

const notifications = (userId: string) =>
  t.sqlite.prepare("SELECT type, title, body, link_path FROM notifications WHERE user_id = ? ORDER BY rowid").all(userId) as {
    type: string;
    title: string;
    body: string;
    link_path: string | null;
  }[];

const audits = (action: string) =>
  t.sqlite.prepare("SELECT actor_user_id, entity_id, metadata_json FROM audit_events WHERE action = ?").all(action) as {
    actor_user_id: string;
    entity_id: string;
    metadata_json: string;
  }[];

async function storedBytes(storageKey: string): Promise<Buffer | null> {
  try {
    return await t.ctx.storage.read(storageKey);
  } catch {
    return null;
  }
}

async function match(requestId: string, mechanicId: string, status = "notified"): Promise<void> {
  await t.ctx.db
    .insertInto("job_matches")
    .values({ id: newId(), request_id: requestId, mechanic_id: mechanicId, distance_miles: 2.5, rank: 1, status, notified_at: t.ctx.now.toISOString() })
    .execute();
}

// ---------------------------------------------------------------------------------
// profile pictures
// ---------------------------------------------------------------------------------

describe("profile pictures", () => {
  it("are stored re-encoded without metadata, replace the previous picture and can be removed", async () => {
    const first = await setMyAvatar(t.ctx, customer, pictures("user_avatar")[0]);
    expect(first.src).toBe(`/api/files/${first.fileId}`);
    expect(await getMyAvatar(t.ctx, customer)).toEqual(first);
    const firstRow = fileRow(first.fileId);
    expect(firstRow).toMatchObject({ purpose: "user_avatar", owner_user_id: customer.id, metadata_stripped: 1 });
    expect(Math.max(firstRow!.width, firstRow!.height)).toBeLessThanOrEqual(512);
    const bytes = await storedBytes(firstRow!.storage_key);
    expect(bytes).not.toBeNull();
    const metadata = await sharp(bytes!).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(firstRow!.storage_key).toMatch(/^avatars\/2026\/[0-9a-f-]+\.jpg$/);

    const second = await setMyAvatar(t.ctx, customer, pictures("user_avatar")[0]);
    expect(fileRow(first.fileId)).toBeUndefined();
    expect(await storedBytes(firstRow!.storage_key)).toBeNull();
    expect((await getMyAvatar(t.ctx, customer))?.fileId).toBe(second.fileId);
    expect(audits("account.avatar_set")).toHaveLength(2);

    const secondKey = fileRow(second.fileId)!.storage_key;
    expect(await removeMyAvatar(t.ctx, customer)).toBe(true);
    expect(await getMyAvatar(t.ctx, customer)).toBeNull();
    expect(fileRow(second.fileId)).toBeUndefined();
    expect(await storedBytes(secondKey)).toBeNull();
    expect(await removeMyAvatar(t.ctx, customer)).toBe(false);
    expect(audits("account.avatar_remove")).toHaveLength(1);
  });

  it("are for customers and admins; mechanics use their profile photo", async () => {
    await setMyAvatar(t.ctx, admin, pictures("user_avatar")[0]);
    expect(await rejection(setMyAvatar(t.ctx, mechanic, pictures("user_avatar")[0]))).toMatchObject({ code: "forbidden" });
    expect(await rejection(removeMyAvatar(t.ctx, mechanic))).toMatchObject({ code: "forbidden" });
  });

  it("feed the header avatar: a mechanic's profile photo, anyone else's profile picture", async () => {
    expect(await getHeaderAvatarSrc(t.ctx, customer)).toBeNull();
    const avatar = await setMyAvatar(t.ctx, customer, pictures("user_avatar")[0]);
    expect(await getHeaderAvatarSrc(t.ctx, customer)).toBe(avatar.src);

    expect(await getHeaderAvatarSrc(t.ctx, mechanic)).toBeNull();
    const photoId = newId();
    t.sqlite
      .prepare("INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256, metadata_stripped) VALUES (?, ?, 'mechanic_profile_photo', ?, 'image/jpeg', 10, ?, 1)")
      .run(photoId, mechanic.id, `profile-photos/2026/${photoId}.jpg`, "e".repeat(64));
    t.sqlite.prepare("UPDATE mechanic_profiles SET profile_photo_file_id = ? WHERE user_id = ?").run(photoId, mechanic.id);
    expect(await getHeaderAvatarSrc(t.ctx, mechanic)).toBe(`/api/files/${photoId}`);
  });

  it("are offered to a mechanic only on a confirmed (or later) booking with the customer", async () => {
    const avatar = await setMyAvatar(t.ctx, customer, pictures("user_avatar")[0]);
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic.id);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    await createPendingBooking(t.ctx, { quote, customer });
    expect(await getVisibleAvatarSrc(t.ctx, mechanic, customer.id)).toBeNull();

    await createDemoFixtureBooking(t.ctx, { customer, mechanic: otherMechanic, status: "confirmed" });
    expect(await getVisibleAvatarSrc(t.ctx, otherMechanic, customer.id)).toBe(avatar.src);
    expect(await getVisibleAvatarSrc(t.ctx, mechanic, customer.id)).toBeNull();
    expect(await getVisibleAvatarSrc(t.ctx, otherCustomer, customer.id)).toBeNull();
  });

  it("count toward the hourly picture allowance", async () => {
    await writeTx(t.ctx.db, (trx) => consumePictureAllowance(trx, t.ctx.now, customer.id, MEDIA_LIMITS.picturesPerHour));
    const refused = await rejection(setMyAvatar(t.ctx, customer, pictures("user_avatar")[0]));
    expect(refused).toMatchObject({ code: "rate_limited" });
    expect(refused.userMessage).toMatch(/up to 60 pictures an hour\. Try again in 60 minutes/);
    expect(await getMyAvatar(t.ctx, customer)).toBeNull();
    // nothing of the refused upload was kept
    expect(t.sqlite.prepare("SELECT count(*) AS n FROM files").get()).toEqual({ n: 0 });

    const later = withNow(t.ctx, new Date(t.ctx.now.getTime() + 61 * 60_000));
    await setMyAvatar(later, customer, pictures("user_avatar")[0]);
  });
});

// ---------------------------------------------------------------------------------
// photos added to a request
// ---------------------------------------------------------------------------------

describe("photos added to a request", () => {
  async function seedPhotos(requestId: string, ownerId: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const id = newId();
      t.sqlite
        .prepare("INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256, metadata_stripped) VALUES (?, ?, 'request_photo', ?, 'image/jpeg', 10, ?, 1)")
        .run(id, ownerId, `request-photos/2026/${id}.jpg`, "f".repeat(64));
      t.sqlite.prepare("INSERT INTO request_media (file_id, request_id, kind, shareable_before_booking) VALUES (?, ?, 'photo', 1)").run(id, requestId);
    }
  }

  it("are shared with matched mechanics like the originals, who are notified", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    await match(request.id, mechanic.id);
    const passed = await createMechanic(t.ctx);
    await match(request.id, passed.id, "passed");
    const suspended = await createMechanic(t.ctx, { status: "suspended", statusReason: "Test suspension" });
    await match(request.id, suspended.id);

    const result = await addRequestPhotos(t.ctx, customer, { requestId: request.id, uploads: pictures("request_photo", 2) });
    expect(result).toEqual({ added: 2, photoCount: 2 });
    const media = t.sqlite.prepare("SELECT file_id, kind, shareable_before_booking FROM request_media WHERE request_id = ?").all(request.id) as {
      file_id: string;
      kind: string;
      shareable_before_booking: number;
    }[];
    expect(media).toHaveLength(2);
    for (const row of media) {
      expect(row).toMatchObject({ kind: "photo", shareable_before_booking: 1 });
      expect(fileRow(row.file_id)).toMatchObject({ purpose: "request_photo", owner_user_id: customer.id, metadata_stripped: 1 });
      expect(await canViewFile(t.ctx, mechanic, row.file_id)).toBe(true);
      expect(await canViewFile(t.ctx, otherMechanic, row.file_id)).toBe(false);
      expect(await canViewFile(t.ctx, otherCustomer, row.file_id)).toBe(false);
    }

    expect(notifications(mechanic.id)).toEqual([
      expect.objectContaining({ type: "request.photos_added", link_path: `/mechanic/jobs/${request.id}`, body: expect.stringMatching(/added 2 photos/) }),
    ]);
    expect(notifications(passed.id)).toEqual([]);
    expect(notifications(suspended.id)).toEqual([]);
    expect(audits("request.photos_add")).toEqual([expect.objectContaining({ actor_user_id: customer.id, entity_id: request.id })]);

    expect((await listRequestPhotos(t.ctx, customer, request.id)).map((photo) => photo.fileId).sort()).toEqual(media.map((row) => row.file_id).sort());
    expect(await listRequestPhotos(t.ctx, mechanic, request.id)).toHaveLength(2);
    expect(await listRequestPhotos(t.ctx, otherMechanic, request.id)).toEqual([]);
    expect(await listRequestPhotos(t.ctx, otherCustomer, request.id)).toEqual([]);
  });

  it("keep the request at 8 photos in all", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    await seedPhotos(request.id, customer.id, 5);
    expect(await getRequestPhotoAllowance(t.ctx, customer, request.id)).toMatchObject({
      photoCount: 5,
      limit: 8,
      acceptsPhotos: true,
      remaining: 3,
      perUpload: 3,
      closedReason: null,
    });
    const tooMany = await rejection(addRequestPhotos(t.ctx, customer, { requestId: request.id, uploads: pictures("request_photo", 4) }));
    expect(tooMany).toMatchObject({ code: "invalid_input", userMessage: "A request can have up to 8 photos. You can add 3 photos more." });
    await addRequestPhotos(t.ctx, customer, { requestId: request.id, uploads: pictures("request_photo", 3) });
    const full = await rejection(addRequestPhotos(t.ctx, customer, { requestId: request.id, uploads: pictures("request_photo") }));
    expect(full.userMessage).toBe("This request already has 8 photos, the most it can hold.");
    expect(await getRequestPhotoAllowance(t.ctx, customer, request.id)).toMatchObject({ remaining: 0, acceptsPhotos: true });
  });

  it("are refused on someone else's request, for other roles, and once the request is closed or expired", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    for (const viewer of [otherCustomer, mechanic, admin]) {
      expect(await rejection(addRequestPhotos(t.ctx, viewer, { requestId: request.id, uploads: pictures("request_photo") }))).toMatchObject({
        code: "not_found",
      });
      expect(await rejection(getRequestPhotoAllowance(t.ctx, viewer, request.id))).toMatchObject({ code: "not_found" });
    }

    const expiredLater = withNow(t.ctx, new Date(Date.parse(request.expiresAt) + 60_000));
    expect(await rejection(addRequestPhotos(expiredLater, customer, { requestId: request.id, uploads: pictures("request_photo") }))).toMatchObject({
      code: "conflict",
      userMessage: "Photos can be added while the request is open for quotes.",
    });

    const booked = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed" });
    expect(await rejection(addRequestPhotos(t.ctx, customer, { requestId: booked.request.id, uploads: pictures("request_photo") }))).toMatchObject({
      code: "conflict",
    });
    expect(await getRequestPhotoAllowance(t.ctx, customer, booked.request.id)).toMatchObject({ acceptsPhotos: false, remaining: 0 });
    expect(t.sqlite.prepare("SELECT count(*) AS n FROM files").get()).toEqual({ n: 0 });
  });
});

// ---------------------------------------------------------------------------------
// mechanic work gallery
// ---------------------------------------------------------------------------------

describe("mechanic work gallery", () => {
  const ids = async (viewer: Viewer) => (await getMyGalleryOverview(t.ctx, viewer)).photos.map((photo) => photo.id);

  it("adds photos in order with an optional caption, up to 12", async () => {
    expect(await addGalleryPhotos(t.ctx, mechanic, { uploads: pictures("mechanic_gallery", 3), caption: "  New   pads​ and rotors " })).toEqual({
      added: 3,
      total: 3,
    });
    const overview = await getMyGalleryOverview(t.ctx, mechanic);
    expect(overview).toMatchObject({ hasProfile: true, limit: 12, remaining: 9, perUpload: 9 });
    expect(overview.photos.map((photo) => [photo.sortOrder, photo.caption])).toEqual([
      [0, "New pads and rotors"],
      [1, "New pads and rotors"],
      [2, "New pads and rotors"],
    ]);
    for (const photo of overview.photos) {
      expect(fileRow(photo.fileId)).toMatchObject({ purpose: "mechanic_gallery", owner_user_id: mechanic.id, metadata_stripped: 1 });
      expect(photo.src).toBe(`/api/files/${photo.fileId}`);
    }
    await addGalleryPhotos(t.ctx, mechanic, { uploads: pictures("mechanic_gallery", 9) });
    const full = await rejection(addGalleryPhotos(t.ctx, mechanic, { uploads: pictures("mechanic_gallery") }));
    expect(full.userMessage).toBe("Your gallery holds up to 12 photos. Remove one to add another.");
    expect(audits("mechanic.gallery_add")).toHaveLength(2);
  });

  it("edits captions, reorders and removes only the mechanic's own photos", async () => {
    await addGalleryPhotos(t.ctx, mechanic, { uploads: pictures("mechanic_gallery", 3) });
    const [a, b, c] = await ids(mechanic);

    expect(await updateGalleryCaption(t.ctx, mechanic, { photoId: b, caption: " Timing belt " })).toEqual({ caption: "Timing belt" });
    expect(await updateGalleryCaption(t.ctx, mechanic, { photoId: b, caption: "   " })).toEqual({ caption: null });
    expect(await rejection(updateGalleryCaption(t.ctx, mechanic, { photoId: b, caption: "x".repeat(141) }))).toMatchObject({ code: "invalid_input" });
    expect(await rejection(updateGalleryCaption(t.ctx, otherMechanic, { photoId: b, caption: "Mine now" }))).toMatchObject({ code: "not_found" });

    await reorderGallery(t.ctx, mechanic, { photoIds: [c, a, b] });
    expect(await ids(mechanic)).toEqual([c, a, b]);
    expect(await rejection(reorderGallery(t.ctx, mechanic, { photoIds: [c, a] }))).toMatchObject({ code: "conflict" });
    expect(await rejection(reorderGallery(t.ctx, mechanic, { photoIds: [c, a, a] }))).toMatchObject({ code: "conflict" });

    await moveGalleryPhoto(t.ctx, mechanic, { photoId: b, direction: "earlier" });
    expect(await ids(mechanic)).toEqual([c, b, a]);
    await moveGalleryPhoto(t.ctx, mechanic, { photoId: c, direction: "earlier" }); // already first
    expect(await ids(mechanic)).toEqual([c, b, a]);
    expect(await rejection(moveGalleryPhoto(t.ctx, otherMechanic, { photoId: c, direction: "later" }))).toMatchObject({ code: "not_found" });

    const removedFile = (await getMyGalleryOverview(t.ctx, mechanic)).photos.find((photo) => photo.id === b)!.fileId;
    const removedKey = fileRow(removedFile)!.storage_key;
    expect(await rejection(removeGalleryPhoto(t.ctx, otherMechanic, { photoId: b }))).toMatchObject({ code: "not_found" });
    await removeGalleryPhoto(t.ctx, mechanic, { photoId: b });
    const after = await getMyGalleryOverview(t.ctx, mechanic);
    expect(after.photos.map((photo) => [photo.id, photo.sortOrder])).toEqual([
      [c, 0],
      [a, 1],
    ]);
    expect(fileRow(removedFile)).toBeUndefined();
    expect(await storedBytes(removedKey)).toBeNull();
    expect(audits("mechanic.gallery_remove")).toHaveLength(1);
  });

  it("is shown to customers the mechanic quoted for or is booked with, never to others", async () => {
    await addGalleryPhotos(t.ctx, mechanic, { uploads: pictures("mechanic_gallery", 2) });
    const request = await createOpenRequest(t.ctx, customer);
    expect(await listMechanicGallery(t.ctx, customer, mechanic.id)).toEqual([]);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const seen = await listMechanicGallery(t.ctx, customer, mechanic.id);
    expect(seen).toHaveLength(2);
    expect(seen[0].alt).toMatch(/Work photo 1 by Marco R\./);
    for (const photo of seen) expect(await canViewFile(t.ctx, customer, photo.fileId)).toBe(true);

    expect(await listMechanicGallery(t.ctx, otherCustomer, mechanic.id)).toEqual([]);
    expect(await listMechanicGallery(t.ctx, otherMechanic, mechanic.id)).toEqual([]);
    expect(await listMechanicGallery(t.ctx, mechanic, mechanic.id)).toHaveLength(2);
    expect(await listMechanicGallery(t.ctx, admin, mechanic.id)).toHaveLength(2);

    await createDemoFixtureBooking(t.ctx, { customer: otherCustomer, mechanic, status: "completed" });
    expect(await listMechanicGallery(t.ctx, otherCustomer, mechanic.id)).toHaveLength(2);
  });

  it("is for mechanics with a profile", async () => {
    expect(await rejection(addGalleryPhotos(t.ctx, customer, { uploads: pictures("mechanic_gallery") }))).toMatchObject({ code: "not_found" });
    const newcomer = await createUser(t.ctx, { role: "mechanic" });
    expect(await rejection(addGalleryPhotos(t.ctx, newcomer, { uploads: pictures("mechanic_gallery") }))).toMatchObject({
      code: "conflict",
      userMessage: "Finish your mechanic application before adding work photos.",
    });
    expect(await getMyGalleryOverview(t.ctx, newcomer)).toMatchObject({ hasProfile: false, photos: [] });
    expect(t.sqlite.prepare("SELECT count(*) AS n FROM files").get()).toEqual({ n: 0 });
  });
});

// ---------------------------------------------------------------------------------
// booking photos
// ---------------------------------------------------------------------------------

describe("booking photos", () => {
  it("are added by either party of a confirmed booking, who notify each other", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed" });
    expect(await addBookingPhotos(t.ctx, customer, { bookingId: booking.id, phase: "before", uploads: pictures("booking_photo", 2) })).toEqual({
      added: 2,
      total: 2,
    });
    expect(notifications(mechanic.id)).toEqual([
      expect.objectContaining({ type: "booking.photos_added", title: "The customer added 2 before photos", link_path: `/mechanic/bookings/${booking.id}` }),
    ]);

    const later = withNow(t.ctx, new Date(t.ctx.now.getTime() + 60_000));
    await addBookingPhotos(later, mechanic, { bookingId: booking.id, phase: "after", caption: "New pads fitted", uploads: pictures("booking_photo") });
    expect(notifications(customer.id)).toEqual([
      expect.objectContaining({ type: "booking.photos_added", title: "Marco R. added an after photo", link_path: `/bookings/${booking.id}` }),
    ]);
    expect(audits("booking.photos_add")).toHaveLength(2);

    const forCustomer = await getBookingPhotos(t.ctx, customer, booking.id);
    expect(forCustomer).toMatchObject({ viewerRole: "customer", canAdd: true, closedReason: null, remaining: 37, perUpload: 10, limit: 40 });
    expect(forCustomer.photos.map((photo) => [photo.phase, photo.uploadedByRole, photo.mine, photo.caption])).toEqual([
      ["before", "customer", true, null],
      ["before", "customer", true, null],
      ["after", "mechanic", false, "New pads fitted"],
    ]);
    const forMechanic = await getBookingPhotos(t.ctx, mechanic, booking.id);
    expect(forMechanic.photos.map((photo) => photo.mine)).toEqual([false, false, true]);
    for (const photo of forMechanic.photos) expect(await canViewFile(t.ctx, mechanic, photo.fileId)).toBe(true);

    const forAdmin = await getBookingPhotos(t.ctx, admin, booking.id);
    expect(forAdmin).toMatchObject({ viewerRole: "admin", canAdd: false, closedReason: null });
    expect(forAdmin.photos).toHaveLength(3);
  });

  it("are refused before confirmation, after cancellation, for other people and with an unknown phase", async () => {
    const request = await createOpenRequest(t.ctx, customer);
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const pending = await createPendingBooking(t.ctx, { quote, customer });
    expect(await rejection(addBookingPhotos(t.ctx, customer, { bookingId: pending.id, phase: "before", uploads: pictures("booking_photo") }))).toMatchObject({
      code: "conflict",
      userMessage: "Photos can be added once the booking is confirmed.",
    });
    expect(await getBookingPhotos(t.ctx, customer, pending.id)).toMatchObject({
      canAdd: false,
      closedReason: "Photos can be added once the booking is confirmed.",
    });

    const cancelled = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "cancelled" });
    expect(await rejection(addBookingPhotos(t.ctx, mechanic, { bookingId: cancelled.id, phase: "after", uploads: pictures("booking_photo") }))).toMatchObject({
      code: "conflict",
      userMessage: "This booking was cancelled, so no more photos can be added.",
    });

    const confirmed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "in_progress" });
    for (const viewer of [otherCustomer, otherMechanic, admin]) {
      expect(await rejection(addBookingPhotos(t.ctx, viewer, { bookingId: confirmed.id, phase: "other", uploads: pictures("booking_photo") }))).toMatchObject({
        code: "not_found",
      });
    }
    for (const viewer of [otherCustomer, otherMechanic]) {
      expect(await rejection(getBookingPhotos(t.ctx, viewer, confirmed.id))).toMatchObject({ code: "not_found" });
    }
    expect(
      await rejection(addBookingPhotos(t.ctx, customer, { bookingId: confirmed.id, phase: "during" as "before", uploads: pictures("booking_photo") })),
    ).toMatchObject({ code: "invalid_input" });
    expect(t.sqlite.prepare("SELECT count(*) AS n FROM files").get()).toEqual({ n: 0 });
  });

  it("hold at most 40 per booking", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
    for (let index = 0; index < 39; index += 1) {
      const id = newId();
      t.sqlite
        .prepare("INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256, metadata_stripped) VALUES (?, ?, 'booking_photo', ?, 'image/jpeg', 10, ?, 1)")
        .run(id, customer.id, `booking-photos/2026/${id}.jpg`, "c".repeat(64));
      t.sqlite.prepare("INSERT INTO booking_photos (id, booking_id, file_id, uploaded_by, phase) VALUES (?, ?, ?, ?, 'before')").run(newId(), booking.id, id, customer.id);
    }
    expect((await rejection(addBookingPhotos(t.ctx, mechanic, { bookingId: booking.id, phase: "after", uploads: pictures("booking_photo", 2) }))).userMessage).toBe(
      "A booking can have up to 40 photos. You can add 1 photo more.",
    );
    await addBookingPhotos(t.ctx, mechanic, { bookingId: booking.id, phase: "after", uploads: pictures("booking_photo") });
    expect(await getBookingPhotos(t.ctx, mechanic, booking.id)).toMatchObject({
      canAdd: false,
      closedReason: "This booking already has 40 photos, the most it can hold.",
    });
  });

  it("are removed by their uploader only; after a cancellation the mechanic keeps only their own", async () => {
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed" });
    await addBookingPhotos(t.ctx, customer, { bookingId: booking.id, phase: "before", uploads: pictures("booking_photo") });
    await addBookingPhotos(t.ctx, mechanic, { bookingId: booking.id, phase: "after", uploads: pictures("booking_photo") });
    const photos = (await getBookingPhotos(t.ctx, customer, booking.id)).photos;
    const customerPhoto = photos.find((photo) => photo.mine)!;
    const mechanicPhoto = photos.find((photo) => !photo.mine)!;

    expect(await rejection(removeBookingPhoto(t.ctx, mechanic, { photoId: customerPhoto.id }))).toMatchObject({ code: "not_found" });
    expect(await rejection(removeBookingPhoto(t.ctx, admin, { photoId: customerPhoto.id }))).toMatchObject({ code: "not_found" });

    t.sqlite.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'Test' WHERE id = ?").run(t.ctx.now.toISOString(), booking.id);
    expect((await getBookingPhotos(t.ctx, mechanic, booking.id)).photos.map((photo) => photo.id)).toEqual([mechanicPhoto.id]);
    expect((await getBookingPhotos(t.ctx, customer, booking.id)).photos).toHaveLength(2);

    const key = fileRow(mechanicPhoto.fileId)!.storage_key;
    expect(await removeBookingPhoto(t.ctx, mechanic, { photoId: mechanicPhoto.id })).toEqual({ bookingId: booking.id });
    expect(fileRow(mechanicPhoto.fileId)).toBeUndefined();
    expect(await storedBytes(key)).toBeNull();
    expect(audits("booking.photo_remove")).toHaveLength(1);
  });
});

describe("captions", () => {
  it("are trimmed, single-spaced and free of invisible characters", () => {
    expect(normalizeCaption("  Brake‮  job\n done ")).toBe("Brake job done");
    expect(normalizeCaption("")).toBeNull();
    expect(normalizeCaption(null)).toBeNull();
    expect(() => normalizeCaption("é".repeat(141))).toThrow(DomainError);
    expect(normalizeCaption("é".repeat(140))).toHaveLength(140);
  });
});
