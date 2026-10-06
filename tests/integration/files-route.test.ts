// GET /api/files/[id] on both storage backends: local disk (the default) and a private Vercel
// Blob store (a fake client). The access rules are the same on both, and every refusal is the
// same 404. Blob files over STREAMED_FILE_MAX_BYTES are answered with a short-lived signed URL
// instead of the bytes (Vercel Functions cannot send responses over 4.5 MB).
import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/files/[id]/route";
import type { AppContext, Viewer } from "@/server/context";
import { newId } from "@/server/ids";
import { createBlobFileStorage, type BlobClient } from "@/server/storage/blob-storage";
import { STREAMED_FILE_MAX_BYTES } from "@/server/storage/config";
import type { FileStorage } from "@/server/storage/types";
import { createTestContext, type TestContext } from "../support/db";
import { createUser } from "../support/factories";

const stub = vi.hoisted(() => ({
  ctx: undefined as AppContext | undefined,
  viewer: null as Viewer | null,
}));

vi.mock("@/server/auth/viewer", () => ({
  getViewer: async () => stub.viewer,
}));

vi.mock("@/server/context", () => ({
  createAppContext: () => {
    if (!stub.ctx) throw new Error("no test context");
    return stub.ctx;
  },
}));

/** An in-memory private Blob store. */
function fakeBlobStore() {
  const blobs = new Map<string, Buffer>();
  const signed: string[] = [];
  const client: BlobClient = {
    async put(pathname, body, { allowOverwrite }) {
      if (!allowOverwrite && blobs.has(pathname)) throw new Error("This blob already exists");
      blobs.set(pathname, Buffer.from(body));
    },
    async get(pathname) {
      const blob = blobs.get(pathname);
      return blob ? new Response(Uint8Array.from(blob)).body : null;
    },
    async del(pathname) {
      blobs.delete(pathname);
    },
    async presignGet(pathname, validUntil, options) {
      signed.push(pathname);
      const download = options?.download ? "&download=1" : "";
      return `https://store.private.blob.vercel-storage.com/${pathname}?vercel-blob-signature=test&until=${validUntil}${download}`;
    },
  };
  return { client, blobs, signed };
}

const BACKENDS = ["local", "blob"] as const;

describe.each(BACKENDS)("GET /api/files/[id] on %s storage", (backend) => {
  let t: TestContext;
  let storage: FileStorage;
  let blobStore: ReturnType<typeof fakeBlobStore>;
  let owner: Viewer;
  let otherCustomer: Viewer;
  let admin: Viewer;

  /** Stores `bytes` and adds a files row for them (sizeBytes may claim more, for the size rule). */
  async function addFile(
    ownerId: string,
    purpose: "request_video" | "mechanic_document" | "user_avatar",
    mimeType: string,
    bytes: Buffer,
    sizeBytes = bytes.byteLength,
  ): Promise<{ id: string; key: string }> {
    const id = newId();
    const extension = { "video/mp4": "mp4", "application/pdf": "pdf", "image/jpeg": "jpg" }[mimeType] ?? "bin";
    const key = `test-files/2026/${id}.${extension}`;
    await storage.put(key, bytes);
    await t.ctx.db
      .insertInto("files")
      .values({
        id,
        owner_user_id: ownerId,
        purpose,
        storage_key: key,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        width: null,
        height: null,
        sha256: "0".repeat(64),
        metadata_stripped: mimeType.startsWith("image/") ? 1 : 0,
        original_name: "my-secret-name.jpg",
        created_at: t.ctx.now.toISOString(),
      })
      .execute();
    return { id, key };
  }

  async function get(id: string, viewer: Viewer | null, headers: Record<string, string> = {}): Promise<Response> {
    stub.viewer = viewer;
    return GET(new NextRequest(`http://localhost/api/files/${id}`, { headers }), { params: Promise.resolve({ id }) });
  }

  async function expectNotFound(response: Response): Promise<void> {
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("Not found");
  }

  beforeEach(async () => {
    t = createTestContext();
    blobStore = fakeBlobStore();
    storage = backend === "blob" ? createBlobFileStorage(blobStore.client) : t.ctx.storage;
    stub.ctx = { ...t.ctx, storage };
    owner = await createUser(t.ctx, { role: "customer" });
    otherCustomer = await createUser(t.ctx, { role: "customer" });
    admin = await createUser(t.ctx, { role: "admin" });
  });

  afterEach(async () => {
    stub.ctx = undefined;
    stub.viewer = null;
    await t.cleanup();
  });

  it("streams a file to the people allowed to see it, with private headers and a generic name", async () => {
    const jpeg = Buffer.from("fake jpeg bytes for the route");
    const file = await addFile(owner.id, "user_avatar", "image/jpeg", jpeg);
    for (const viewer of [owner, admin]) {
      const response = await get(file.id, viewer);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(jpeg)).toBe(true);
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "content-type": "image/jpeg",
        "content-disposition": `inline; filename="profile-picture-${file.id.slice(0, 8)}.jpg"`,
        "content-length": String(jpeg.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
      });
    }
  });

  it("answers everyone else, signed-out visitors, unknown ids and missing bytes with the same 404", async () => {
    const file = await addFile(owner.id, "user_avatar", "image/jpeg", Buffer.from("x"));
    await expectNotFound(await get(file.id, otherCustomer));
    await expectNotFound(await get(file.id, null));
    await expectNotFound(await get(newId(), owner));
    await expectNotFound(await get("../../etc/passwd", owner));

    const gone = await addFile(owner.id, "user_avatar", "image/jpeg", Buffer.from("y"));
    await storage.remove(gone.key);
    await expectNotFound(await get(gone.id, owner));
  });

  it("sends documents as attachments, only to their owner and admins", async () => {
    const pdf = Buffer.from("%PDF-1.4 test document");
    const file = await addFile(owner.id, "mechanic_document", "application/pdf", pdf);
    const response = await get(file.id, owner);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="document-${file.id.slice(0, 8)}.pdf"`);
    expect((await get(file.id, admin)).status).toBe(200);
    await expectNotFound(await get(file.id, otherCustomer));
  });

  it("serves byte ranges of a video, and refuses a range past the end", async () => {
    const video = Buffer.from("0123456789abcdefghij");
    const file = await addFile(owner.id, "request_video", "video/mp4", video);
    const partial = await get(file.id, owner, { range: "bytes=5-9" });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 5-9/${video.byteLength}`);
    expect(partial.headers.get("accept-ranges")).toBe("bytes");
    expect(await partial.text()).toBe("56789");
    const past = await get(file.id, owner, { range: "bytes=50-" });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe(`bytes */${video.byteLength}`);
  });

  if (backend === "blob") {
    it("redirects to a short-lived signed URL for files over the response limit, after the access check", async () => {
      const file = await addFile(owner.id, "request_video", "video/mp4", Buffer.from("big video"), STREAMED_FILE_MAX_BYTES + 1);
      const response = await get(file.id, owner, { range: "bytes=0-" });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toMatch(
        new RegExp(`^https://store\\.private\\.blob\\.vercel-storage\\.com/${file.key}\\?vercel-blob-signature=`),
      );
      expect(response.headers.get("location")).not.toContain("download=1");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(blobStore.signed).toEqual([file.key]);

      await expectNotFound(await get(file.id, otherCustomer));
      await expectNotFound(await get(file.id, null));
      expect(blobStore.signed).toEqual([file.key]);
    });

    it("keeps large documents downloads: their signed URL asks the Blob CDN for an attachment", async () => {
      const file = await addFile(owner.id, "mechanic_document", "application/pdf", Buffer.from("%PDF-1.4"), STREAMED_FILE_MAX_BYTES + 1);
      const response = await get(file.id, owner);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toMatch(/&download=1$/);
      await expectNotFound(await get(file.id, otherCustomer));
    });

    it("streams files up to the limit itself", async () => {
      const file = await addFile(owner.id, "request_video", "video/mp4", Buffer.from("small video"), STREAMED_FILE_MAX_BYTES);
      const response = await get(file.id, owner);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("small video");
      expect(blobStore.signed).toEqual([]);
    });
  } else {
    it("streams large files too (local storage has no signed URLs), from UPLOAD_DIR as before", async () => {
      const big = Buffer.alloc(STREAMED_FILE_MAX_BYTES + 1024, 7);
      const file = await addFile(owner.id, "request_video", "video/mp4", big);
      expect(fs.existsSync(path.join(t.dir, "uploads", ...file.key.split("/")))).toBe(true);
      const response = await get(file.id, owner);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-length")).toBe(String(big.byteLength));
      expect(Buffer.from(await response.arrayBuffer()).equals(big)).toBe(true);
    });
  }
});
