// Database guarantees from db/migrations/0001_init.sql: every trigger, the important CHECK and
// UNIQUE constraints, how violations map to DomainErrors, and writeTx semantics. Violating
// statements use raw SQL on the test connection so each assertion targets the database itself,
// not application code.
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BOOKING_STATUSES,
  CHANGE_ORDER_STATUSES,
  MECHANIC_STATUSES,
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  type UserRole,
} from "@/lib/domain";
import { recordAudit } from "@/server/audit";
import { addHours, addMinutes } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { DomainError, mapDbError } from "@/server/errors";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { computeInvoiceTotals } from "@/server/pricing";
import { createTestContext, openExtraConnection, type TestContext } from "../support/db";
import {
  bookingRowFor,
  createDemoFixtureBooking,
  createMechanic,
  createOpenRequest,
  createPendingBooking,
  createSubmittedQuote,
  createUser,
  insertBooking,
  type TestBooking,
  type TestDemoBooking,
} from "../support/factories";

let t: TestContext;
let iso: string;

beforeEach(() => {
  t = createTestContext();
  iso = t.ctx.now.toISOString();
});

afterEach(async () => {
  await t.cleanup();
});

// ---------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------

const run = (text: string, ...params: unknown[]) => t.sqlite.prepare(text).run(...params);
const get = (text: string, ...params: unknown[]) => t.sqlite.prepare(text).get(...params);
const count = (table: string) => (get(`SELECT count(*) AS n FROM ${table}`) as { n: number }).n;

function insertRow(table: string, row: Record<string, unknown>): void {
  const columns = Object.keys(row);
  t.sqlite
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((column) => row[column]));
}

/** Inserts a copy of a row with some columns replaced. INSERT skips the UPDATE triggers, so
 *  this puts a row straight into any state, the way demo fixtures are created. */
function cloneRow(table: string, id: string, overrides: Record<string, unknown>): void {
  const row = get(`SELECT * FROM ${table} WHERE id = ?`, id) as Record<string, unknown>;
  insertRow(table, { ...row, ...overrides });
}

const exactly = (message: string) => new RegExp(`^${message}$`);
const CHECK_FAILED = /CHECK constraint failed/;

function expectRaise(action: () => unknown, message: string, label?: string): void {
  expect(action, label).toThrow(exactly(message));
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the statement to fail");
}

type Transition = { from: string; to: string; allowed: boolean; label: string };

function transitions(statuses: readonly string[], allowed: readonly string[]): Transition[] {
  return statuses.flatMap((from) =>
    statuses
      .filter((to) => to !== from)
      .map((to) => ({ from, to, allowed: allowed.includes(`${from}>${to}`), label: `${from} > ${to}` })),
  );
}

async function scenario() {
  const customer = await createUser(t.ctx, { role: "customer" });
  const mechanic = await createMechanic(t.ctx);
  const request = await createOpenRequest(t.ctx, customer);
  return { customer, mechanic, request };
}

async function quotedScenario() {
  const world = await scenario();
  const quote = await createSubmittedQuote(t.ctx, { requestId: world.request.id, mechanicId: world.mechanic.id });
  return { ...world, quote };
}

// ---------------------------------------------------------------------------------
// accounts and files
// ---------------------------------------------------------------------------------

describe("users", () => {
  it("never change role once created", async () => {
    const user = await createUser(t.ctx, { role: "customer" });
    for (const role of ["admin", "mechanic"]) {
      expectRaise(() => run("UPDATE users SET role = ? WHERE id = ?", role, user.id), "role_immutable", role);
    }
    run("UPDATE users SET role = 'customer', display_name = 'Renamed' WHERE id = ?", user.id);
    expect(get("SELECT role, display_name FROM users WHERE id = ?", user.id)).toEqual({
      role: "customer",
      display_name: "Renamed",
    });
  });

  it("have unique emails regardless of case and one of three roles", async () => {
    await createUser(t.ctx, { role: "customer", email: "Sam.Driver@Example.test" });
    await expect(createUser(t.ctx, { role: "mechanic", email: "sam.driver@example.TEST" })).rejects.toThrow(
      "UNIQUE constraint failed: users.email",
    );
    await expect(createUser(t.ctx, { role: "superuser" as UserRole })).rejects.toThrow(CHECK_FAILED);
  });
});

describe("files", () => {
  let owner: Viewer;
  beforeEach(async () => {
    owner = await createUser(t.ctx, { role: "customer" });
  });

  const file = (overrides: Record<string, unknown>) => ({
    id: newId(),
    owner_user_id: owner.id,
    purpose: "request_photo",
    storage_key: `request_photo/2026/${newId()}.jpg`,
    mime_type: "image/jpeg",
    size_bytes: 1024,
    width: 800,
    height: 600,
    sha256: "a".repeat(64),
    metadata_stripped: 1,
    ...overrides,
  });

  it("store images only with their metadata stripped", () => {
    insertRow("files", file({}));
    expect(() => insertRow("files", file({ metadata_stripped: 0 }))).toThrow(CHECK_FAILED);
    expect(() =>
      insertRow("files", file({ purpose: "mechanic_profile_photo", mime_type: "image/png", metadata_stripped: 0 })),
    ).toThrow(CHECK_FAILED);
    expect(() =>
      insertRow("files", file({ purpose: "mechanic_document", mime_type: "image/webp", metadata_stripped: 0 })),
    ).toThrow(CHECK_FAILED);
    // videos and PDFs cannot be sanitized here; they stay private instead
    const unsanitized = { metadata_stripped: 0, width: null, height: null };
    insertRow("files", file({ ...unsanitized, purpose: "request_video", mime_type: "video/mp4", storage_key: `request_video/2026/${newId()}.mp4` }));
    insertRow("files", file({ ...unsanitized, purpose: "mechanic_document", mime_type: "application/pdf", storage_key: `mechanic_document/2026/${newId()}.pdf` }));
  });

  it("tie MIME types to the upload purpose", () => {
    expect(() => insertRow("files", file({ mime_type: "application/pdf" }))).toThrow(CHECK_FAILED);
    expect(() => insertRow("files", file({ purpose: "request_video", mime_type: "image/jpeg" }))).toThrow(CHECK_FAILED);
    expect(() => insertRow("files", file({ mime_type: "image/heic" }))).toThrow(CHECK_FAILED);
  });

  it("reject storage keys that could leave the upload directory", () => {
    for (const storageKey of ["../outside.jpg", "request_photo/../../x.jpg", "/absolute/x.jpg", "request_photo\\x.jpg"]) {
      expect(() => insertRow("files", file({ storage_key: storageKey })), storageKey).toThrow(CHECK_FAILED);
    }
  });

  it("accept the picture purposes of 0003 as metadata-stripped images only", () => {
    for (const purpose of ["user_avatar", "mechanic_gallery", "booking_photo"]) {
      insertRow("files", file({ purpose, storage_key: `${purpose}/2026/${newId()}.jpg` }));
      expect(() => insertRow("files", file({ purpose, metadata_stripped: 0 })), `${purpose} unstripped`).toThrow(CHECK_FAILED);
      for (const mime of ["application/pdf", "video/mp4"]) {
        expect(() => insertRow("files", file({ purpose, mime_type: mime, metadata_stripped: 0 })), `${purpose} ${mime}`).toThrow(CHECK_FAILED);
      }
    }
    expect(() => insertRow("files", file({ purpose: "cover_photo" }))).toThrow(CHECK_FAILED);
  });
});

// ---------------------------------------------------------------------------------
// pictures people add (0003_media)
// ---------------------------------------------------------------------------------

describe("media pictures", () => {
  function pictureFile(ownerId: string, purpose: "user_avatar" | "mechanic_gallery" | "booking_photo" | "request_photo"): string {
    const id = newId();
    insertRow("files", {
      id,
      owner_user_id: ownerId,
      purpose,
      storage_key: `${purpose}/2026/${id}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 2048,
      sha256: "d".repeat(64),
      metadata_stripped: 1,
    });
    return id;
  }

  it("give each account at most one current profile picture, cleared when its file is deleted", async () => {
    const user = await createUser(t.ctx, { role: "customer" });
    const other = await createUser(t.ctx, { role: "customer" });
    const avatar = pictureFile(user.id, "user_avatar");
    run("UPDATE users SET avatar_file_id = ? WHERE id = ?", avatar, user.id);
    expect(() => run("UPDATE users SET avatar_file_id = ? WHERE id = ?", avatar, other.id)).toThrow(
      "UNIQUE constraint failed: users.avatar_file_id",
    );
    expect(() => run("UPDATE users SET avatar_file_id = ? WHERE id = ?", newId(), user.id)).toThrow(/FOREIGN KEY/);
    run("DELETE FROM files WHERE id = ?", avatar);
    expect(get("SELECT avatar_file_id FROM users WHERE id = ?", user.id)).toEqual({ avatar_file_id: null });
  });

  it("keep gallery photos with their mechanic and file, with short captions", async () => {
    const mechanic = await createMechanic(t.ctx);
    const other = await createMechanic(t.ctx);
    const fileId = pictureFile(mechanic.id, "mechanic_gallery");
    const row = { id: newId(), mechanic_id: mechanic.id, file_id: fileId, caption: "New pads and rotors", sort_order: 0 };
    for (const caption of ["", "   ", "x".repeat(141)]) {
      expect(() => insertRow("mechanic_gallery", { ...row, caption }), JSON.stringify(caption)).toThrow(CHECK_FAILED);
    }
    expect(() => insertRow("mechanic_gallery", { ...row, sort_order: -1 })).toThrow(CHECK_FAILED);
    insertRow("mechanic_gallery", { ...row, caption: "x".repeat(140) });
    expect(() => insertRow("mechanic_gallery", { ...row, id: newId() })).toThrow("UNIQUE constraint failed: mechanic_gallery.file_id");

    run("UPDATE mechanic_gallery SET caption = NULL, sort_order = 3 WHERE id = ?", row.id);
    expectRaise(() => run("UPDATE mechanic_gallery SET mechanic_id = ? WHERE id = ?", other.id, row.id), "mechanic_gallery_immutable");
    expectRaise(
      () => run("UPDATE mechanic_gallery SET file_id = ? WHERE id = ?", pictureFile(mechanic.id, "mechanic_gallery"), row.id),
      "mechanic_gallery_immutable",
    );
    run("DELETE FROM files WHERE id = ?", fileId);
    expect(count("mechanic_gallery")).toBe(0);
  });

  describe("booking photos", () => {
    const ALLOWED: readonly string[] = ["confirmed", "in_progress", "completed", "disputed"];

    function photoRow(bookingId: string, uploadedBy: string, fileId: string, overrides: Record<string, unknown> = {}) {
      return { id: newId(), booking_id: bookingId, file_id: fileId, uploaded_by: uploadedBy, phase: "before", ...overrides };
    }

    it("can be added only once the booking is confirmed (or later)", async () => {
      const customer = await createUser(t.ctx, { role: "customer" });
      const mechanic = await createMechanic(t.ctx);
      for (const status of ["confirmed", "in_progress", "completed", "disputed", "cancelled"] as const) {
        const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status });
        const insert = () => insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(customer.id, "booking_photo")));
        if (ALLOWED.includes(status)) insert();
        else expectRaise(insert, "booking_photos_immutable", status);
      }
      const { quote } = await quotedScenario();
      const pendingCustomer = (get("SELECT customer_id AS id FROM repair_requests WHERE id = ?", quote.requestId) as { id: string }).id;
      const pending = await createPendingBooking(t.ctx, {
        quote,
        customer: { id: pendingCustomer, role: "customer", email: "x@example.test", displayName: "X" },
      });
      expectRaise(
        () => insertRow("booking_photos", photoRow(pending.id, pendingCustomer, pictureFile(pendingCustomer, "booking_photo"))),
        "booking_photos_immutable",
        "pending_payment",
      );
    });

    it("must be added by the booking's customer or mechanic, with their own booking photo file", async () => {
      const customer = await createUser(t.ctx, { role: "customer" });
      const mechanic = await createMechanic(t.ctx);
      const stranger = await createUser(t.ctx, { role: "customer" });
      const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "in_progress" });

      insertRow("booking_photos", photoRow(booking.id, mechanic.id, pictureFile(mechanic.id, "booking_photo"), { phase: "after" }));
      expectRaise(
        () => insertRow("booking_photos", photoRow(booking.id, stranger.id, pictureFile(stranger.id, "booking_photo"))),
        "booking_photos_immutable",
        "stranger",
      );
      expectRaise(
        () => insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(mechanic.id, "booking_photo"))),
        "booking_photos_immutable",
        "someone else's file",
      );
      expectRaise(
        () => insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(customer.id, "request_photo"))),
        "booking_photos_immutable",
        "another purpose",
      );
      expect(() =>
        insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(customer.id, "booking_photo"), { phase: "during" })),
      ).toThrow(CHECK_FAILED);
      expect(() =>
        insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(customer.id, "booking_photo"), { caption: "y".repeat(141) })),
      ).toThrow(CHECK_FAILED);
    });

    it("never move to another booking, file or uploader, and go with their file", async () => {
      const customer = await createUser(t.ctx, { role: "customer" });
      const mechanic = await createMechanic(t.ctx);
      const first = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
      const second = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
      const fileId = pictureFile(customer.id, "booking_photo");
      const row = photoRow(first.id, customer.id, fileId);
      insertRow("booking_photos", row);

      run("UPDATE booking_photos SET caption = 'Scratch on the bumper', phase = 'other' WHERE id = ?", row.id);
      expectRaise(() => run("UPDATE booking_photos SET booking_id = ? WHERE id = ?", second.id, row.id), "booking_photos_immutable");
      expectRaise(() => run("UPDATE booking_photos SET uploaded_by = ? WHERE id = ?", mechanic.id, row.id), "booking_photos_immutable");
      expectRaise(
        () => run("UPDATE booking_photos SET file_id = ? WHERE id = ?", pictureFile(customer.id, "booking_photo"), row.id),
        "booking_photos_immutable",
      );
      expect(() => insertRow("booking_photos", { ...row, id: newId() })).toThrow("UNIQUE constraint failed: booking_photos.file_id");
      run("DELETE FROM files WHERE id = ?", fileId);
      expect(count("booking_photos")).toBe(0);
    });

    it("map their trigger refusals to a DomainError", async () => {
      const customer = await createUser(t.ctx, { role: "customer" });
      const mechanic = await createMechanic(t.ctx);
      const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "cancelled" });
      const error = captureError(() =>
        insertRow("booking_photos", photoRow(booking.id, customer.id, pictureFile(customer.id, "booking_photo"))),
      );
      expect(mapDbError(error)).toMatchObject({ code: "conflict", details: { dbReason: "booking_photos_immutable" } });
    });
  });
});

// ---------------------------------------------------------------------------------
// mechanics
// ---------------------------------------------------------------------------------

describe("mechanic status", () => {
  const ALLOWED = [
    "applied>under_review",
    "applied>approved",
    "applied>rejected",
    "under_review>approved",
    "under_review>rejected",
    "approved>suspended",
    "suspended>approved",
    "suspended>rejected",
    "rejected>applied",
  ];

  it("allows exactly the documented transitions", async () => {
    for (const { from, to, allowed, label } of transitions(MECHANIC_STATUSES, ALLOWED)) {
      const mechanic = await createMechanic(t.ctx, { status: from as (typeof MECHANIC_STATUSES)[number] });
      const update = () =>
        run(
          "UPDATE mechanic_profiles SET status = ?, status_reason = ? WHERE user_id = ?",
          to,
          "Recorded by an admin",
          mechanic.id,
        );
      if (allowed) expect(update, label).not.toThrow();
      else expectRaise(update, "invalid_mechanic_status_transition", label);
    }
  });

  it("requires a reason of at least 3 characters to reject or suspend", async () => {
    const mechanic = await createMechanic(t.ctx);
    for (const reason of [null, "   ", "no"]) {
      expect(
        () => run("UPDATE mechanic_profiles SET status = 'suspended', status_reason = ? WHERE user_id = ?", reason, mechanic.id),
        String(reason),
      ).toThrow(CHECK_FAILED);
    }
    run("UPDATE mechanic_profiles SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE user_id = ?", mechanic.id);
    const applicant = await createMechanic(t.ctx, { status: "applied" });
    expect(() => run("UPDATE mechanic_profiles SET status = 'rejected' WHERE user_id = ?", applicant.id)).toThrow(CHECK_FAILED);
  });

  it("cannot be approved without insurance on file", async () => {
    const noProvider = await createMechanic(t.ctx, { status: "applied", insuranceProvider: null });
    const noExpiry = await createMechanic(t.ctx, { status: "under_review", insuranceExpiresOn: null });
    const suspended = await createMechanic(t.ctx, { status: "suspended", insuranceProvider: null, insuranceExpiresOn: null });
    for (const mechanic of [noProvider, noExpiry, suspended]) {
      expectRaise(
        () => run("UPDATE mechanic_profiles SET status = 'approved' WHERE user_id = ?", mechanic.id),
        "insurance_required_for_approval",
      );
    }
    // recording the insurance in the approving update is enough
    run(
      "UPDATE mechanic_profiles SET status = 'approved', insurance_provider = 'Desert Mutual', insurance_expires_on = '2027-10-01' WHERE user_id = ?",
      noProvider.id,
    );
  });
});

// ---------------------------------------------------------------------------------
// requests
// ---------------------------------------------------------------------------------

describe("repair request status", () => {
  const ALLOWED = [
    "draft>open",
    "draft>cancelled",
    "open>quoted",
    "open>expired",
    "open>cancelled",
    "quoted>open",
    "quoted>reserved",
    "quoted>expired",
    "quoted>cancelled",
    "reserved>booked",
    "reserved>cancelled",
  ];

  it("allows exactly the documented transitions", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const template = await createOpenRequest(t.ctx, customer);
    let hour = 48;
    for (const { from, to, allowed, label } of transitions(REQUEST_STATUSES, ALLOWED)) {
      const id = newId();
      cloneRow("repair_requests", template.id, { id, status: from });
      // back reserved/booked with the booking they require, so only the transition rule decides
      if (to === "reserved" || to === "booked") {
        const quote = await createSubmittedQuote(t.ctx, {
          requestId: id,
          mechanicId: mechanic.id,
          slotStart: addHours(t.ctx.now, (hour += 2)),
          markRequestQuoted: false,
        });
        await insertBooking(
          t.ctx,
          to === "reserved"
            ? { quote, customerId: customer.id }
            : { quote, customerId: customer.id, status: "confirmed", isDemoFixture: true },
        );
      }
      const update = () => run("UPDATE repair_requests SET status = ? WHERE id = ?", to, id);
      if (allowed) expect(update, label).not.toThrow();
      else expectRaise(update, "invalid_request_transition", label);
    }
  });

  it("needs a pending booking to be reserved and a confirmed one to be booked", async () => {
    const { customer, mechanic, request } = await scenario();
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const reserve = (id: string) => () => run("UPDATE repair_requests SET status = 'reserved' WHERE id = ?", id);

    expectRaise(reserve(request.id), "request_status_requires_booking");
    await insertBooking(t.ctx, { quote, customerId: customer.id });
    expect(reserve(request.id)).not.toThrow();
    // payment never confirms the reservation, so the request cannot become booked
    expectRaise(
      () => run("UPDATE repair_requests SET status = 'booked' WHERE id = ?", request.id),
      "request_status_requires_booking",
    );

    // a cancelled booking backs nothing
    const other = await createOpenRequest(t.ctx, customer);
    const otherQuote = await createSubmittedQuote(t.ctx, {
      requestId: other.id,
      mechanicId: mechanic.id,
      slotStart: addHours(t.ctx.now, 60),
    });
    const cancelled = await insertBooking(t.ctx, { quote: otherQuote, customerId: customer.id });
    run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", cancelled.id);
    expectRaise(reserve(other.id), "request_status_requires_booking");
  });

  it("records submission and expiry times once submitted", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const template = await createOpenRequest(t.ctx, customer);
    const id = newId();
    cloneRow("repair_requests", template.id, { id, status: "draft", submitted_at: null, expires_at: null });
    expect(() => run("UPDATE repair_requests SET status = 'open' WHERE id = ?", id)).toThrow(CHECK_FAILED);
    run(
      "UPDATE repair_requests SET status = 'open', submitted_at = ?, expires_at = ? WHERE id = ?",
      iso,
      addHours(t.ctx.now, 168).toISOString(),
      id,
    );
  });
});

// ---------------------------------------------------------------------------------
// quotes
// ---------------------------------------------------------------------------------

describe("quote slots", () => {
  it("cannot overlap the mechanic's other active quotes", async () => {
    const { customer, mechanic, request } = await scenario();
    const otherRequest = await createOpenRequest(t.ctx, customer);
    const start = addHours(t.ctx.now, 48);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart: start, durationMinutes: 90 });

    const overlapping: [number, number][] = [
      [60, 60], // overlaps the end
      [-30, 45], // overlaps the start
      [15, 30], // inside
      [-30, 180], // covers it
      [0, 90], // identical
    ];
    for (const [offset, duration] of overlapping) {
      await expect(
        createSubmittedQuote(t.ctx, {
          requestId: otherRequest.id,
          mechanicId: mechanic.id,
          slotStart: addMinutes(start, offset),
          durationMinutes: duration,
        }),
        `${offset}/${duration}`,
      ).rejects.toThrow(exactly("slot_conflict"));
    }
    // back-to-back is not an overlap
    await createSubmittedQuote(t.ctx, {
      requestId: otherRequest.id,
      mechanicId: mechanic.id,
      slotStart: addMinutes(start, 90),
      durationMinutes: 60,
    });
    // another mechanic may offer the same time
    const second = await createMechanic(t.ctx);
    await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: second.id, slotStart: start, durationMinutes: 90 });
  });

  it("counts selected quotes and ignores expired, withdrawn and declined ones", async () => {
    const { customer, mechanic } = await scenario();
    const start = addHours(t.ctx.now, 48);
    const cases = [
      ["selected", true],
      ["expired", false],
      ["withdrawn", false],
      ["declined", false],
    ] as const;
    for (const [status, blocks] of cases) {
      const request = await createOpenRequest(t.ctx, customer);
      const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart: start });
      run("UPDATE quotes SET status = ? WHERE id = ?", status, quote.id);
      const next = await createOpenRequest(t.ctx, customer);
      const attempt = createSubmittedQuote(t.ctx, { requestId: next.id, mechanicId: mechanic.id, slotStart: start });
      if (blocks) {
        await expect(attempt, status).rejects.toThrow(exactly("slot_conflict"));
        run("UPDATE quotes SET status = 'declined' WHERE id = ?", quote.id);
      } else {
        const created = await attempt;
        run("UPDATE quotes SET status = 'withdrawn' WHERE id = ?", created.id);
      }
    }
  });

  it("cannot overlap the mechanic's active bookings", async () => {
    const { customer, mechanic } = await scenario();
    const cases = [
      ["pending_payment", true],
      ["confirmed", true],
      ["in_progress", true],
      ["completed", false],
      ["cancelled", false],
      ["disputed", false],
    ] as const;
    let hour = 48;
    for (const [status, blocks] of cases) {
      const slotStart = addHours(t.ctx.now, (hour += 4));
      let booking: TestBooking;
      if (status === "pending_payment") {
        const request = await createOpenRequest(t.ctx, customer);
        const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart });
        booking = await createPendingBooking(t.ctx, { quote, customer });
      } else {
        booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart });
      }
      // release the booked quote so only the booking itself can hold the slot
      run("UPDATE quotes SET status = 'declined' WHERE id = ?", booking.quoteId);

      const next = await createOpenRequest(t.ctx, customer);
      const attempt = () =>
        createSubmittedQuote(t.ctx, { requestId: next.id, mechanicId: mechanic.id, slotStart: addMinutes(slotStart, 30) });
      if (!blocks) {
        await attempt();
        continue;
      }
      await expect(attempt(), status).rejects.toThrow(exactly("slot_conflict"));
      if (status === "pending_payment") {
        // cancelling the reservation frees the time
        run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", booking.id);
        await attempt();
      }
    }
  });
});

describe("one active quote per mechanic and request", () => {
  it("allows a new quote only after the previous one is withdrawn", async () => {
    const { mechanic, request } = await scenario();
    const first = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const resend = () =>
      createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart: addHours(t.ctx.now, 72) });
    await expect(resend()).rejects.toThrow("UNIQUE constraint failed: quotes.request_id, quotes.mechanic_id");
    run("UPDATE quotes SET status = 'withdrawn', withdrawn_at = ? WHERE id = ?", iso, first.id);
    await resend();
  });
});

describe("quote status", () => {
  const ALLOWED = [
    "submitted>withdrawn",
    "submitted>expired",
    "submitted>selected",
    "submitted>declined",
    "selected>declined",
  ];

  it("allows exactly the documented transitions", async () => {
    const { customer, mechanic, request } = await scenario();
    const template = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    run("UPDATE quotes SET status = 'withdrawn' WHERE id = ?", template.id);
    let hour = 48;
    for (const { from, to, allowed, label } of transitions(QUOTE_STATUSES, ALLOWED)) {
      const target = await createOpenRequest(t.ctx, customer);
      const start = addHours(t.ctx.now, (hour += 2));
      const id = newId();
      cloneRow("quotes", template.id, {
        id,
        request_id: target.id,
        status: from,
        slot_start_at: start.toISOString(),
        slot_end_at: addMinutes(start, 60).toISOString(),
        expires_at: iso,
      });
      const update = () => run("UPDATE quotes SET status = ? WHERE id = ?", to, id);
      if (allowed) expect(update, label).not.toThrow();
      else expectRaise(update, "invalid_quote_transition", label);
    }
  });
});

describe("quote terms and items", () => {
  it("cannot change any term of a sent quote", async () => {
    const { customer, mechanic, request } = await scenario();
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const otherRequest = await createOpenRequest(t.ctx, customer);
    const otherMechanic = await createMechanic(t.ctx);
    const changes: Record<string, unknown> = {
      request_id: otherRequest.id,
      mechanic_id: otherMechanic.id,
      service_mode: "garage",
      parts_included: 0,
      currency: "EUR",
      labor_cents: 99,
      parts_cents: 99,
      tax_cents: 99,
      fee_cents: 99,
      total_cents: 99,
      slot_start_at: "2026-10-09T15:00:00.000Z",
      slot_end_at: "2026-10-09T18:00:00.000Z",
      estimated_duration_minutes: 30,
      scope: "A different scope",
      exclusions: "New exclusions",
      notes: "New notes",
      expires_at: "2026-10-05T18:00:00.000Z",
      is_demo_fixture: 1,
    };
    for (const [column, value] of Object.entries(changes)) {
      expectRaise(() => run(`UPDATE quotes SET ${column} = ? WHERE id = ?`, value, quote.id), "quote_terms_immutable", column);
    }
    // status bookkeeping stays editable
    run("UPDATE quotes SET status = 'withdrawn', withdrawn_at = ?, updated_at = ? WHERE id = ?", iso, iso, quote.id);
  });

  it("cannot edit line items, and every line amount is quantity x unit price", async () => {
    const { mechanic, request } = await scenario();
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    const item = get("SELECT id FROM quote_items WHERE quote_id = ? ORDER BY sort_order", quote.id) as { id: string };
    for (const statement of [
      "UPDATE quote_items SET description = 'Changed' WHERE id = ?",
      "UPDATE quote_items SET unit_price_cents = 1, amount_cents = 1 WHERE id = ?",
      "UPDATE quote_items SET sort_order = 7 WHERE id = ?",
    ]) {
      expectRaise(() => run(statement, item.id), "quote_items_immutable", statement);
    }

    const line = (overrides: Record<string, unknown>) => ({
      id: newId(),
      quote_id: quote.id,
      kind: "part",
      description: "Brake pads",
      quantity: 2,
      unit_price_cents: 3_500,
      amount_cents: 7_000,
      sort_order: 9,
      ...overrides,
    });
    const invalid: Record<string, Record<string, unknown>> = {
      "amount mismatch": { amount_cents: 6_999 },
      "zero quantity": { quantity: 0, amount_cents: 0 },
      "quantity over 100": { quantity: 101, amount_cents: 353_500 },
      "unit price over $100,000": { quantity: 1, unit_price_cents: 10_000_001, amount_cents: 10_000_001 },
      "negative price": { quantity: 1, unit_price_cents: -100, amount_cents: -100 },
      "unknown kind": { kind: "discount" },
      "blank description": { description: "   " },
    };
    for (const [label, overrides] of Object.entries(invalid)) {
      expect(() => insertRow("quote_items", line(overrides)), label).toThrow(CHECK_FAILED);
    }
  });

  it("checks totals, slot order, expiry and currency", async () => {
    const { mechanic, request } = await scenario();
    const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id });
    run("UPDATE quotes SET status = 'withdrawn' WHERE id = ?", quote.id);
    const copy = (overrides: Record<string, unknown>) => () =>
      cloneRow("quotes", quote.id, { id: newId(), status: "withdrawn", ...overrides });
    const invalid: Record<string, Record<string, unknown>> = {
      "total is not the sum": { total_cents: quote.totals.totalCents + 1 },
      "zero total": { labor_cents: 0, parts_cents: 0, tax_cents: 0, fee_cents: 0, total_cents: 0 },
      "negative labor": { labor_cents: -100, total_cents: quote.totals.totalCents - quote.totals.laborCents - 100 },
      "slot ends before it starts": { slot_end_at: quote.slotStartAt },
      "expires after the slot starts": { expires_at: quote.slotEndAt },
      "non-USD currency": { currency: "EUR" },
      "duration under 15 minutes": { estimated_duration_minutes: 10 },
    };
    for (const [label, overrides] of Object.entries(invalid)) {
      expect(copy(overrides), label).toThrow(CHECK_FAILED);
    }
    expect(copy({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------
// bookings
// ---------------------------------------------------------------------------------

describe("bookings", () => {
  it("start as pending_payment unless flagged as demo fixtures", async () => {
    const { customer, quote } = await quotedScenario();
    for (const status of ["confirmed", "in_progress", "completed", "cancelled", "disputed"] as const) {
      expectRaise(
        () => insertRow("bookings", bookingRowFor(t.ctx, quote, customer.id, { status })),
        "booking_must_start_pending_payment",
        status,
      );
    }
    insertRow("bookings", bookingRowFor(t.ctx, quote, customer.id, { status: "confirmed", isDemoFixture: true }));
  });

  it("must match the quote exactly", async () => {
    const { customer, quote } = await quotedScenario();
    const honest = bookingRowFor(t.ctx, quote, customer.id);
    const otherCustomer = await createUser(t.ctx, { role: "customer" });
    const otherMechanic = await createMechanic(t.ctx);
    const otherRequest = await createOpenRequest(t.ctx, customer);
    const tampered: Record<string, Record<string, unknown>> = {
      "lower total": { total_cents: honest.total_cents - 1 },
      "cheaper labor, consistent total": { labor_cents: honest.labor_cents - 1_000, total_cents: honest.total_cents - 1_000 },
      "parts dropped": { parts_cents: 0, total_cents: honest.total_cents - honest.parts_cents },
      "added tax": { tax_cents: 500, total_cents: honest.total_cents + 500 },
      "another customer": { customer_id: otherCustomer.id },
      "another mechanic": { mechanic_id: otherMechanic.id },
      "another request": { request_id: otherRequest.id },
      "moved slot": {
        slot_start_at: addHours(new Date(quote.slotStartAt), 1).toISOString(),
        slot_end_at: addHours(new Date(quote.slotEndAt), 1).toISOString(),
      },
      "other service mode": { service_mode: "garage" },
      "other currency": { currency: "EUR" },
    };
    for (const [label, change] of Object.entries(tampered)) {
      expectRaise(() => insertRow("bookings", { ...honest, ...change }), "booking_does_not_match_quote", label);
    }
    expect(() => insertRow("bookings", honest)).not.toThrow();
  });

  it("allow one booking per request and per quote", async () => {
    const { customer, request, quote } = await quotedScenario();
    const rival = await createMechanic(t.ctx);
    const rivalQuote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: rival.id });
    await createPendingBooking(t.ctx, { quote, customer });

    expect(() => insertRow("bookings", bookingRowFor(t.ctx, rivalQuote, customer.id))).toThrow(
      "UNIQUE constraint failed: bookings.request_id",
    );
    expect(() => insertRow("bookings", bookingRowFor(t.ctx, quote, customer.id))).toThrow(
      /^UNIQUE constraint failed: bookings\.(quote_id|request_id)$/,
    );
    const uniqueIndexes = t.sqlite
      .prepare("SELECT name FROM pragma_index_list('bookings') WHERE \"unique\" = 1 AND origin = 'u'")
      .all() as { name: string }[];
    const uniqueColumns = uniqueIndexes.map(({ name }) =>
      (t.sqlite.prepare("SELECT name FROM pragma_index_info(?)").all(name) as { name: string }[])
        .map((column) => column.name)
        .join(","),
    );
    expect(uniqueColumns.sort()).toEqual(["quote_id", "request_id"]);
  });

  it("cannot move past pending_payment while payments are not connected", async () => {
    const { customer, mechanic, quote } = await quotedScenario();
    const booking = await createPendingBooking(t.ctx, { quote, customer });
    for (const status of ["confirmed", "in_progress", "completed", "disputed"]) {
      expectRaise(() => run("UPDATE bookings SET status = ? WHERE id = ?", status, booking.id), "payment_not_connected", status);
    }
    // not even a demo fixture skips the payment step
    const request = await createOpenRequest(t.ctx, customer);
    const fixtureQuote = await createSubmittedQuote(t.ctx, {
      requestId: request.id,
      mechanicId: mechanic.id,
      slotStart: addHours(t.ctx.now, 72),
    });
    const fixture = await insertBooking(t.ctx, { quote: fixtureQuote, customerId: customer.id, isDemoFixture: true });
    expectRaise(() => run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", fixture.id), "payment_not_connected");

    run(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'Plans changed' WHERE id = ?",
      iso,
      booking.id,
    );
  });

  it("allow exactly the documented transitions", async () => {
    const ALLOWED = [
      "pending_payment>cancelled",
      "confirmed>in_progress",
      "confirmed>cancelled",
      "confirmed>disputed",
      "in_progress>completed",
      "in_progress>cancelled",
      "in_progress>disputed",
      "completed>disputed",
    ];
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    let hour = 48;
    for (const { from, to, allowed, label } of transitions(BOOKING_STATUSES, ALLOWED)) {
      const slotStart = addHours(t.ctx.now, (hour += 3));
      let bookingId: string;
      if (from === "pending_payment") {
        const request = await createOpenRequest(t.ctx, customer);
        const quote = await createSubmittedQuote(t.ctx, { requestId: request.id, mechanicId: mechanic.id, slotStart });
        bookingId = (await createPendingBooking(t.ctx, { quote, customer })).id;
      } else {
        const status = from as Exclude<(typeof BOOKING_STATUSES)[number], "pending_payment">;
        bookingId = (await createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart })).id;
      }
      const update = () => run("UPDATE bookings SET status = ? WHERE id = ?", to, bookingId);
      if (allowed) expect(update, label).not.toThrow();
      else
        expectRaise(
          update,
          from === "pending_payment" ? "payment_not_connected" : "invalid_booking_transition",
          label,
        );
    }
  });

  it("freeze parties, slot, money and snapshots", async () => {
    const { customer, quote } = await quotedScenario();
    const booking = await createPendingBooking(t.ctx, { quote, customer });
    const otherCustomer = await createUser(t.ctx, { role: "customer" });
    const otherMechanic = await createMechanic(t.ctx);
    const otherRequest = await createOpenRequest(t.ctx, customer);
    const otherQuote = await createSubmittedQuote(t.ctx, { requestId: otherRequest.id, mechanicId: otherMechanic.id });
    const changes: Record<string, unknown> = {
      request_id: otherRequest.id,
      quote_id: otherQuote.id,
      customer_id: otherCustomer.id,
      mechanic_id: otherMechanic.id,
      service_mode: "garage",
      slot_start_at: "2026-10-09T15:00:00.000Z",
      slot_end_at: "2026-10-09T18:00:00.000Z",
      currency: "EUR",
      labor_cents: 1,
      parts_cents: 1,
      tax_cents: 1,
      fee_cents: 1,
      total_cents: 4,
      platform_fee_bps: 500,
      platform_fee_cents: 0,
      mechanic_payout_cents: 4,
      quote_snapshot_json: "{}",
      consent_snapshot_json: "{}",
      is_demo_fixture: 1,
      payment_state: "demo_fixture_no_real_payment",
      created_at: "2020-01-01T00:00:00.000Z",
    };
    for (const [column, value] of Object.entries(changes)) {
      expectRaise(
        () => run(`UPDATE bookings SET ${column} = ? WHERE id = ?`, value, booking.id),
        "booking_snapshot_immutable",
        column,
      );
    }
    run(
      "UPDATE bookings SET status = 'cancelled', cancel_reason = 'Customer cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
      iso,
      iso,
      booking.id,
    );
  });

  it("keep payouts locked on real bookings", async () => {
    const { customer, mechanic, quote } = await quotedScenario();
    const booking = await createPendingBooking(t.ctx, { quote, customer });
    for (const status of ["pending", "sent", "failed", "held"]) {
      expectRaise(() => run("UPDATE bookings SET payout_status = ? WHERE id = ?", status, booking.id), "payout_not_connected", status);
    }
    const fixture = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic,
      status: "completed",
      slotStart: addHours(t.ctx.now, 96),
    });
    run("UPDATE bookings SET payout_status = 'pending' WHERE id = ?", fixture.id);
  });

  it("check the fee and payout formulas and the fixture flags", async () => {
    const { customer, quote } = await quotedScenario();
    const honest = bookingRowFor(t.ctx, quote, customer.id);
    const invalid: Record<string, Record<string, unknown>> = {
      "fee off by a cent": {
        platform_fee_cents: honest.platform_fee_cents + 1,
        mechanic_payout_cents: honest.mechanic_payout_cents - 1,
      },
      "payout not total minus fee": { mechanic_payout_cents: honest.mechanic_payout_cents + 1 },
      "fee rate above 30%": { platform_fee_bps: 3001 },
      "real booking with the fixture payment state": { payment_state: "demo_fixture_no_real_payment" },
      "fixture without the fixture payment state": { is_demo_fixture: 1 },
      "real booking with a payout": { payout_status: "pending" },
      "invalid snapshot JSON": { quote_snapshot_json: "{not json" },
    };
    for (const [label, change] of Object.entries(invalid)) {
      expect(() => insertRow("bookings", { ...honest, ...change }), label).toThrow(CHECK_FAILED);
    }
    expect(() => insertRow("bookings", honest)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------
// post-booking records
// ---------------------------------------------------------------------------------

describe("change orders", () => {
  const changeOrder = (bookingId: string, proposedBy: string, overrides: Record<string, unknown> = {}) => ({
    id: newId(),
    booking_id: bookingId,
    proposed_by: proposedBy,
    description: "Replace the cracked serpentine belt",
    reason: "Found cracks while inspecting the pulleys",
    currency: "USD",
    labor_cents: 3_000,
    parts_cents: 2_500,
    tax_cents: 200,
    amount_cents: 5_700,
    status: "proposed",
    payment_state: "demo_fixture_no_real_payment",
    is_demo_fixture: 1,
    created_at: iso,
    updated_at: iso,
    ...overrides,
  });

  it("need a confirmed or in-progress booking", async () => {
    const { customer, mechanic, quote } = await quotedScenario();
    const pending = await createPendingBooking(t.ctx, { quote, customer });
    expectRaise(
      () => insertRow("change_orders", changeOrder(pending.id, mechanic.id, { is_demo_fixture: 0, payment_state: "stripe_not_connected" })),
      "change_order_requires_active_booking",
    );
    const cases = [
      ["confirmed", true],
      ["in_progress", true],
      ["completed", false],
      ["cancelled", false],
      ["disputed", false],
    ] as const;
    let hour = 60;
    for (const [status, ok] of cases) {
      const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart: addHours(t.ctx.now, (hour += 3)) });
      const insert = () => insertRow("change_orders", changeOrder(booking.id, mechanic.id));
      if (ok) expect(insert, status).not.toThrow();
      else expectRaise(insert, "change_order_requires_active_booking", status);
    }
  });

  it("allow exactly the documented transitions", async () => {
    const ALLOWED = ["proposed>approved", "proposed>rejected", "proposed>void", "approved>void"];
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "in_progress" });
    for (const { from, to, allowed, label } of transitions(CHANGE_ORDER_STATUSES, ALLOWED)) {
      const decided = from === "proposed" ? { decided_at: null, decided_by: null } : { decided_at: iso, decided_by: customer.id };
      const row = changeOrder(booking.id, mechanic.id, { status: from, ...decided });
      insertRow("change_orders", row);
      const update = () =>
        run("UPDATE change_orders SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?", to, iso, customer.id, row.id);
      if (allowed) expect(update, label).not.toThrow();
      else expectRaise(update, "invalid_change_order_transition", label);
    }
  });

  it("freeze their terms once proposed", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed" });
    const other = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed", slotStart: addHours(t.ctx.now, 72) });
    const row = changeOrder(booking.id, mechanic.id);
    insertRow("change_orders", row);
    const changes: Record<string, unknown> = {
      booking_id: other.id,
      proposed_by: customer.id,
      description: "Something else entirely",
      reason: "A different reason",
      currency: "EUR",
      labor_cents: 1,
      parts_cents: 1,
      tax_cents: 1,
      amount_cents: 3,
      is_demo_fixture: 0,
    };
    for (const [column, value] of Object.entries(changes)) {
      expectRaise(
        () => run(`UPDATE change_orders SET ${column} = ? WHERE id = ?`, value, row.id),
        "change_order_terms_immutable",
        column,
      );
    }
    run(
      "UPDATE change_orders SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = 'Go ahead' WHERE id = ?",
      customer.id,
      iso,
      row.id,
    );
  });

  it("check the amount and the decision time", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "confirmed" });
    const invalid: Record<string, Record<string, unknown>> = {
      "amount is not the sum": { amount_cents: 5_701 },
      "zero amount": { labor_cents: 0, parts_cents: 0, tax_cents: 0, amount_cents: 0 },
      "decided without a time": { status: "approved", decided_at: null },
      "short reason": { reason: "no" },
    };
    for (const [label, overrides] of Object.entries(invalid)) {
      expect(() => insertRow("change_orders", changeOrder(booking.id, mechanic.id, overrides)), label).toThrow(CHECK_FAILED);
    }
  });
});

describe("invoices", () => {
  const invoice = (booking: TestDemoBooking, issuedBy: string, overrides: Record<string, unknown> = {}) => {
    const totals = computeInvoiceTotals(booking.quote.totals, []);
    return {
      id: newId(),
      booking_id: booking.id,
      invoice_number: `INV-TEST-${newId().slice(0, 8)}`,
      currency: "USD",
      line_items_json: JSON.stringify([{ kind: "labor", description: "Labor", amountCents: totals.laborCents }]),
      labor_cents: totals.laborCents,
      parts_cents: totals.partsCents,
      tax_cents: totals.taxCents,
      fee_cents: totals.feeCents,
      total_cents: totals.totalCents,
      platform_fee_bps: totals.platformFeeBps,
      platform_fee_cents: totals.platformFeeCents,
      mechanic_payout_cents: totals.mechanicPayoutCents,
      approved_change_order_count: 0,
      notes: null,
      issued_by: issuedBy,
      issued_at: iso,
      is_demo_fixture: 1,
      ...overrides,
    };
  };

  it("need a completed (or disputed) booking with the same fixture flag", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const cases = [
      ["confirmed", false],
      ["in_progress", false],
      ["cancelled", false],
      ["completed", true],
      ["disputed", true],
    ] as const;
    let hour = 48;
    for (const [status, ok] of cases) {
      const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart: addHours(t.ctx.now, (hour += 3)) });
      const insert = () => insertRow("invoices", invoice(booking, mechanic.id));
      if (ok) expect(insert, status).not.toThrow();
      else expectRaise(insert, "invoice_requires_completed_booking", status);
    }
    const completed = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed", slotStart: addHours(t.ctx.now, 120) });
    expectRaise(
      () => insertRow("invoices", invoice(completed, mechanic.id, { is_demo_fixture: 0 })),
      "invoice_requires_completed_booking",
    );
  });

  it("are immutable once issued", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
    const row = invoice(booking, mechanic.id);
    insertRow("invoices", row);
    for (const statement of [
      "UPDATE invoices SET notes = 'edited' WHERE id = ?",
      "UPDATE invoices SET total_cents = total_cents + 1, labor_cents = labor_cents + 1 WHERE id = ?",
      "UPDATE invoices SET issued_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    ]) {
      expectRaise(() => run(statement, row.id), "invoice_immutable", statement);
    }
  });

  it("check the money formulas and allow one per booking", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
    const honest = invoice(booking, mechanic.id);
    const invalid: Record<string, Record<string, unknown>> = {
      "fee off by a cent": {
        platform_fee_cents: honest.platform_fee_cents + 1,
        mechanic_payout_cents: honest.mechanic_payout_cents - 1,
      },
      "total is not the sum": { total_cents: honest.total_cents + 1 },
      "line items not an array": { line_items_json: '{"labor":1}' },
    };
    for (const [label, change] of Object.entries(invalid)) {
      expect(() => insertRow("invoices", { ...honest, ...change }), label).toThrow(CHECK_FAILED);
    }
    insertRow("invoices", honest);
    expect(() => insertRow("invoices", { ...honest, id: newId(), invoice_number: "INV-SECOND" })).toThrow(
      "UNIQUE constraint failed: invoices.booking_id",
    );
  });
});

describe("reviews", () => {
  const review = (booking: TestBooking, overrides: Record<string, unknown> = {}) => ({
    id: newId(),
    booking_id: booking.id,
    customer_id: booking.customerId,
    mechanic_id: booking.mechanicId,
    rating: 5,
    comment: "On time and explained everything.",
    is_demo_fixture: 1,
    created_at: iso,
    ...overrides,
  });

  it("need a completed booking by the reviewing customer", async () => {
    const { customer, mechanic, quote } = await quotedScenario();
    const completed = await createDemoFixtureBooking(t.ctx, {
      customer,
      mechanic,
      status: "completed",
      slotStart: addHours(t.ctx.now, 72),
    });
    const stranger = await createUser(t.ctx, { role: "customer" });
    const otherMechanic = await createMechanic(t.ctx);
    const wrong: Record<string, Record<string, unknown>> = {
      "another customer": { customer_id: stranger.id },
      "another mechanic": { mechanic_id: otherMechanic.id },
      "real review of a fixture booking": { is_demo_fixture: 0 },
    };
    for (const [label, overrides] of Object.entries(wrong)) {
      expectRaise(() => insertRow("reviews", review(completed, overrides)), "review_requires_completed_booking", label);
    }
    let hour = 96;
    for (const status of ["confirmed", "in_progress", "cancelled", "disputed"] as const) {
      const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status, slotStart: addHours(t.ctx.now, (hour += 3)) });
      expectRaise(() => insertRow("reviews", review(booking)), "review_requires_completed_booking", status);
    }
    const pending = await createPendingBooking(t.ctx, { quote, customer });
    expectRaise(() => insertRow("reviews", review(pending, { is_demo_fixture: 0 })), "review_requires_completed_booking");

    insertRow("reviews", review(completed));
    expect(() => insertRow("reviews", review(completed))).toThrow("UNIQUE constraint failed: reviews.booking_id");
  });

  it("rate from 1 to 5", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const mechanic = await createMechanic(t.ctx);
    const booking = await createDemoFixtureBooking(t.ctx, { customer, mechanic, status: "completed" });
    for (const rating of [0, 6]) {
      expect(() => insertRow("reviews", review(booking, { rating })), String(rating)).toThrow(CHECK_FAILED);
    }
  });
});

// ---------------------------------------------------------------------------------
// audit trail, notifications and other checks
// ---------------------------------------------------------------------------------

describe("audit events", () => {
  it("are recorded with the actor and are append-only", async () => {
    const admin = await createUser(t.ctx, { role: "admin" });
    const id = await writeTx(t.ctx.db, (trx) =>
      recordAudit(trx, {
        actor: admin,
        action: "mechanic.approve",
        entityType: "mechanic",
        entityId: "mechanic-1",
        reason: "  Documents verified  ",
        metadata: { previousStatus: "under_review" },
        at: t.ctx.now,
      }),
    );
    expect(
      get(
        "SELECT actor_user_id, actor_role, action, entity_type, entity_id, reason, metadata_json, created_at FROM audit_events WHERE id = ?",
        id,
      ),
    ).toEqual({
      actor_user_id: admin.id,
      actor_role: "admin",
      action: "mechanic.approve",
      entity_type: "mechanic",
      entity_id: "mechanic-1",
      reason: "Documents verified",
      metadata_json: '{"previousStatus":"under_review"}',
      created_at: iso,
    });

    expectRaise(() => run("UPDATE audit_events SET reason = 'rewritten' WHERE id = ?", id), "audit_append_only");
    expectRaise(() => run("DELETE FROM audit_events WHERE id = ?", id), "audit_append_only");
    await expect(writeTx(t.ctx.db, (trx) => trx.deleteFrom("audit_events").execute())).rejects.toMatchObject({
      name: "DomainError",
      code: "forbidden",
    });
    expect(count("audit_events")).toBe(1);
  });

  it("record system actors and refuse over-long reasons", async () => {
    const id = await writeTx(t.ctx.db, (trx) =>
      recordAudit(trx, { actor: "system", action: "requests.expire", entityType: "request" }),
    );
    expect(get("SELECT actor_user_id, actor_role, entity_id, reason, metadata_json FROM audit_events WHERE id = ?", id)).toEqual({
      actor_user_id: null,
      actor_role: "system",
      entity_id: null,
      reason: null,
      metadata_json: "{}",
    });
    await expect(
      writeTx(t.ctx.db, (trx) =>
        recordAudit(trx, { actor: "system", action: "x", entityType: "y", reason: "r".repeat(501) }),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("notifications", () => {
  it("write an in-app notification and capture the email locally for the account address", async () => {
    const customer = await createUser(t.ctx, { role: "customer", email: "driver@example.test" });
    const result = await writeTx(t.ctx.db, (trx) =>
      notify(trx, {
        userId: customer.id,
        type: "quote.received",
        title: "New quote",
        body: "A mechanic sent a quote for your request.",
        linkPath: "/requests/abc",
        email: { subject: "You have a new quote", text: "Sign in to compare quotes.", template: "quote_received" },
        at: t.ctx.now,
      }),
    );
    expect(get("SELECT user_id, type, title, body, link_path, read_at, created_at FROM notifications WHERE id = ?", result.notificationId)).toEqual({
      user_id: customer.id,
      type: "quote.received",
      title: "New quote",
      body: "A mechanic sent a quote for your request.",
      link_path: "/requests/abc",
      read_at: null,
      created_at: iso,
    });
    expect(
      get("SELECT to_user_id, to_email, subject, body_text, template, delivery, created_at FROM email_outbox WHERE id = ?", result.emailId),
    ).toEqual({
      to_user_id: customer.id,
      to_email: "driver@example.test",
      subject: "You have a new quote",
      body_text: "Sign in to compare quotes.",
      template: "quote_received",
      delivery: "captured_locally",
      created_at: iso,
    });
  });

  it("skip the email unless asked, clip long text and refuse off-site links", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const result = await writeTx(t.ctx.db, (trx) =>
      notify(trx, { userId: customer.id, type: "request.submitted", title: "T".repeat(200), body: "B".repeat(1200) }),
    );
    expect(result.emailId).toBeNull();
    expect(count("email_outbox")).toBe(0);
    const row = get("SELECT title, body FROM notifications WHERE id = ?", result.notificationId) as { title: string; body: string };
    expect([row.title.length, row.body.length]).toEqual([140, 1000]);

    for (const linkPath of ["//evil.example", "https://evil.example", "/\\evil.example", "requests/1"]) {
      await expect(
        writeTx(t.ctx.db, (trx) => notify(trx, { userId: customer.id, type: "x", title: "x", body: "x", linkPath })),
        linkPath,
      ).rejects.toThrow(/linkPath/);
    }
    // the database refuses protocol-relative links too
    expect(() =>
      insertRow("notifications", { id: newId(), user_id: customer.id, type: "x", title: "x", body: "x", link_path: "//evil.example" }),
    ).toThrow(CHECK_FAILED);
  });
});

describe("other checks", () => {
  it("keep request videos private before a confirmed booking", async () => {
    const { customer, request } = await scenario();
    const fileId = newId();
    insertRow("files", {
      id: fileId,
      owner_user_id: customer.id,
      purpose: "request_video",
      storage_key: `request_video/2026/${fileId}.mp4`,
      mime_type: "video/mp4",
      size_bytes: 1_000,
      sha256: "b".repeat(64),
      metadata_stripped: 0,
    });
    const media = { file_id: fileId, request_id: request.id, kind: "video", shareable_before_booking: 1 };
    expect(() => insertRow("request_media", media)).toThrow(CHECK_FAILED);
    insertRow("request_media", { ...media, shareable_before_booking: 0 });
  });

  it("only mark eligible mechanics as notified and store match reasons as a JSON array", async () => {
    const { mechanic, request } = await scenario();
    const evaluation = { request_id: request.id, mechanic_id: mechanic.id, eligible: 0, notified: 1, distance_miles: 4.2, reasons_json: '["out_of_range"]', evaluated_at: iso };
    expect(() => insertRow("match_evaluations", evaluation)).toThrow(CHECK_FAILED);
    expect(() => insertRow("match_evaluations", { ...evaluation, notified: 0, reasons_json: '{"reason":"out_of_range"}' })).toThrow(CHECK_FAILED);
    insertRow("match_evaluations", { ...evaluation, notified: 0 });
  });

  it("capture email locally only and store only session token digests", async () => {
    const user = await createUser(t.ctx, { role: "customer" });
    expect(() =>
      insertRow("email_outbox", { id: newId(), to_user_id: user.id, to_email: user.email, subject: "Hi", body_text: "Hi", template: "t", delivery: "smtp" }),
    ).toThrow(CHECK_FAILED);
    const session = { user_id: user.id, expires_at: addHours(t.ctx.now, 24).toISOString() };
    expect(() => insertRow("sessions", { ...session, id: "raw-token" })).toThrow(CHECK_FAILED);
    insertRow("sessions", { ...session, id: "c".repeat(64) });
  });
});

// ---------------------------------------------------------------------------------
// error mapping and transactions
// ---------------------------------------------------------------------------------

describe("mapDbError", () => {
  it("maps real trigger and unique violations to DomainErrors", async () => {
    const { customer, request, quote } = await quotedScenario();
    const otherRequest = await createOpenRequest(t.ctx, customer);
    const booking = await createPendingBooking(t.ctx, { quote, customer });

    const overlap = captureError(() =>
      cloneRow("quotes", quote.id, { id: newId(), request_id: otherRequest.id, status: "submitted" }),
    );
    expect(mapDbError(overlap)).toMatchObject({ name: "DomainError", code: "slot_conflict", details: { dbReason: "slot_conflict" } });

    const confirm = captureError(() => run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", booking.id));
    expect(mapDbError(confirm)).toMatchObject({ code: "payment_not_connected" });

    const role = captureError(() => run("UPDATE users SET role = 'admin' WHERE id = ?", customer.id));
    expect(mapDbError(role)).toMatchObject({ code: "forbidden" });

    const second = captureError(() => insertRow("bookings", bookingRowFor(t.ctx, quote, customer.id)));
    const mappedSecond = mapDbError(second);
    expect(mappedSecond.code).toBe("conflict");
    expect(mappedSecond.details?.dbReason).toMatch(/^bookings\.(quote_id|request_id)$/);

    const activeQuote = captureError(() =>
      cloneRow("quotes", quote.id, { id: newId(), request_id: request.id, status: "submitted", slot_start_at: addHours(t.ctx.now, 100).toISOString(), slot_end_at: addHours(t.ctx.now, 101).toISOString() }),
    );
    // the original quote is selected, so the partial unique index applies
    expect(mapDbError(activeQuote)).toMatchObject({
      code: "conflict",
      userMessage: expect.stringMatching(/already have an active quote/),
    });

    const email = captureError(() =>
      insertRow("users", { id: newId(), email: customer.email.toUpperCase(), password_hash: "x", role: "customer", display_name: "Dup" }),
    );
    expect(mapDbError(email)).toMatchObject({ code: "conflict", details: { dbReason: "users.email" } });

    const transition = captureError(() => run("UPDATE quotes SET status = 'submitted' WHERE id = ?", quote.id));
    expect(mapDbError(transition)).toMatchObject({ code: "conflict", details: { dbReason: "invalid_quote_transition" } });
  });

  it("maps every RAISE message in the migrations", () => {
    const migrationsDir = path.join(process.cwd(), "db", "migrations");
    const messages = new Set<string>();
    for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))) {
      const source = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      for (const match of source.matchAll(/RAISE\(ABORT,\s*'([a-z_]+)'\)/g)) messages.add(match[1]);
    }
    expect(messages.size).toBeGreaterThanOrEqual(20);
    for (const message of messages) {
      const error = Object.assign(new Error(message), { code: "SQLITE_CONSTRAINT_TRIGGER" });
      const mapped = mapDbError(error);
      expect(mapped, message).toBeInstanceOf(DomainError);
      expect(mapped.userMessage, message).not.toMatch(/_/);
    }
  });

  it("passes DomainErrors through and rethrows anything it does not recognise unchanged", async () => {
    const domain = new DomainError("not_found", "Not found.");
    expect(mapDbError(domain)).toBe(domain);

    const user = await createUser(t.ctx, { role: "customer" });
    const check = captureError(() => run("UPDATE users SET display_name = '' WHERE id = ?", user.id));
    const typeError = new TypeError("boom");
    const unknownTrigger = Object.assign(new Error("something_unexpected"), { code: "SQLITE_CONSTRAINT_TRIGGER" });
    const foreignKey = captureError(() =>
      insertRow("notifications", { id: newId(), user_id: "missing-user", type: "x", title: "x", body: "x" }),
    );
    for (const error of [check, typeError, unknownTrigger, foreignKey, "a string"]) {
      expect(captureError(() => mapDbError(error))).toBe(error);
    }

    const busy = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    expect(mapDbError(busy)).toMatchObject({ code: "conflict" });
  });
});

describe("writeTx", () => {
  it("commits and returns the callback's result", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    const result = await writeTx(t.ctx.db, async (trx) => {
      await notify(trx, { userId: customer.id, type: "test", title: "Saved", body: "Saved" });
      return "done";
    });
    expect(result).toBe("done");
    expect(count("notifications")).toBe(1);
  });

  it("rolls back everything when the callback fails, mapping database errors", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    await expect(
      writeTx(t.ctx.db, async (trx) => {
        await notify(trx, { userId: customer.id, type: "test", title: "Rolled back", body: "Rolled back" });
        await trx.updateTable("users").set({ role: "admin" }).where("id", "=", customer.id).execute();
      }),
    ).rejects.toMatchObject({ name: "DomainError", code: "forbidden", details: { dbReason: "role_immutable" } });
    expect(count("notifications")).toBe(0);
    expect(t.sqlite.inTransaction).toBe(false);
  });

  it("fails fast instead of deadlocking when ctx.db is used inside the transaction", async () => {
    await expect(
      writeTx(t.ctx.db, async () => {
        await t.ctx.db.selectFrom("users").select("id").execute();
      }),
    ).rejects.toThrow(/inside writeTx/);
    // the connection is released and usable afterwards
    expect(await t.ctx.db.selectFrom("service_categories").select("id").execute()).toHaveLength(12);
  });

  it("does not nest", async () => {
    await expect(writeTx(t.ctx.db, (trx) => writeTx(trx, async () => 1))).rejects.toThrow(/does not nest/);
    await expect(writeTx(t.ctx.db, () => writeTx(t.ctx.db, async () => 1))).rejects.toThrow(/does not nest/);
    expect(await writeTx(t.ctx.db, async () => 2)).toBe(2);
  });

  it("serializes concurrent transactions on one connection (no lost updates)", async () => {
    run("INSERT INTO rate_limits (bucket_key, window_started_at, attempt_count) VALUES ('k', ?, 0)", iso);
    const increment = () =>
      writeTx(t.ctx.db, async (trx) => {
        const row = await trx
          .selectFrom("rate_limits")
          .select("attempt_count")
          .where("bucket_key", "=", "k")
          .executeTakeFirstOrThrow();
        await new Promise((resolve) => setTimeout(resolve, 2));
        await trx
          .updateTable("rate_limits")
          .set({ attempt_count: row.attempt_count + 1 })
          .where("bucket_key", "=", "k")
          .execute();
      });
    await Promise.all(Array.from({ length: 10 }, increment));
    expect(get("SELECT attempt_count FROM rate_limits WHERE bucket_key = 'k'")).toEqual({ attempt_count: 10 });
  });

  it("takes the write lock at BEGIN, so another connection cannot write until it commits", async () => {
    const other = openExtraConnection(t.dir);
    other.sqlite.pragma("busy_timeout = 50");
    const row = (key: string) => ({ bucket_key: key, window_started_at: iso, attempt_count: 1 });

    let release!: () => void;
    const holding = new Promise<void>((resolve) => (release = resolve));
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const first = writeTx(t.ctx.db, async (trx) => {
      signalLocked();
      await holding;
      await trx.insertInto("rate_limits").values(row("first")).execute();
    });

    await locked;
    await expect(
      writeTx(other.db, (trx) => trx.insertInto("rate_limits").values(row("second")).execute()),
    ).rejects.toMatchObject({ name: "DomainError", code: "conflict", details: { dbReason: "SQLITE_BUSY" } });

    release();
    await first;
    await writeTx(other.db, (trx) => trx.insertInto("rate_limits").values(row("second")).execute());
    expect(count("rate_limits")).toBe(2);
  });
});
