// File storage backends (src/server/storage): storage keys, local disk storage (the default,
// with paths unchanged), Vercel Blob storage over a fake client and over a mocked SDK, and the
// environment switches in storage/config.ts and app-storage.ts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UPLOAD_LIMITS } from "@/server/config";
import { createBlobFileStorage, vercelBlobClient, type BlobClient } from "@/server/storage/blob-storage";
import { assertStorageKey, contentTypeForKey, InvalidStorageKeyError, isStorageKey } from "@/server/storage/keys";
import { createLocalFileStorage, resolveStorageKey } from "@/server/storage/local-storage";

const sdk = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => sdk);

const KEY = "request-photos/2026/0b6f1f9e-3c1a-4c55-9d43-2f8f0c3e1a77.jpg";
const MiB = 1024 * 1024;

// ---------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------

describe("storage keys", () => {
  it("accept the keys saveFile generates, for every backend alike", () => {
    for (const key of [KEY, "mechanic-documents/2025/abc.pdf", "request-videos/2026/x_y-z.webm", "selftest/2026/a.jpg"]) {
      expect(isStorageKey(key), key).toBe(true);
      expect(() => assertStorageKey(key)).not.toThrow();
    }
  });

  it("refuse traversal, absolute paths, odd characters, Windows device names and over-long keys", () => {
    for (const key of [
      "../secret.jpg",
      "a/../b.jpg",
      "./a.jpg",
      "/abs/a.jpg",
      "C:/a.jpg",
      "a\\b.jpg",
      "Request-Photos/a.jpg",
      "a/b",
      "a/b.",
      "a.b/c.jpg",
      "a//b.jpg",
      "con.jpg",
      "photos/nul/a.jpg",
      "lpt1/a.jpg",
      "a b.jpg",
      `${"a".repeat(200)}.jpg`,
      "",
    ]) {
      expect(isStorageKey(key), key).toBe(false);
      expect(() => assertStorageKey(key), key).toThrow(InvalidStorageKeyError);
    }
  });

  it("map extensions to the stored MIME types", () => {
    expect(contentTypeForKey(KEY)).toBe("image/jpeg");
    expect(contentTypeForKey("a/b.mp4")).toBe("video/mp4");
    expect(contentTypeForKey("a/b.mov")).toBe("video/quicktime");
    expect(contentTypeForKey("a/b.webm")).toBe("video/webm");
    expect(contentTypeForKey("a/b.pdf")).toBe("application/pdf");
    expect(contentTypeForKey("a/b.bin")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------------
// Local disk (the default)
// ---------------------------------------------------------------------------------

describe("local storage", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-storage-"));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps a file at UPLOAD_DIR/<key>, exactly where it always was", async () => {
    const storage = createLocalFileStorage(root);
    await storage.put(KEY, Buffer.from("jpeg bytes"));
    expect(fs.readFileSync(path.join(root, "request-photos", "2026", path.basename(KEY)), "utf8")).toBe("jpeg bytes");
    expect(resolveStorageKey(root, KEY)).toBe(path.join(root, ...KEY.split("/")));
    expect((await storage.read(KEY)).toString()).toBe("jpeg bytes");
    expect(storage.signedReadUrl).toBeUndefined();
  });

  it("never overwrites, reports a missing file as ENOENT and removes idempotently", async () => {
    const storage = createLocalFileStorage(root);
    const key = "booking-photos/2026/once.jpg";
    await storage.put(key, Buffer.from("first"));
    await expect(storage.put(key, Buffer.from("second"))).rejects.toMatchObject({ code: "EEXIST" });
    expect((await storage.read(key)).toString()).toBe("first");
    await storage.remove(key);
    await expect(storage.read(key)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it("refuses malformed keys before touching the disk", async () => {
    const storage = createLocalFileStorage(path.join(root, "inner"));
    await expect(storage.put("../escape.jpg", Buffer.from("x"))).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.read("../escape.jpg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(fs.existsSync(path.join(root, "escape.jpg"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------
// Vercel Blob, over a fake client
// ---------------------------------------------------------------------------------

/** An in-memory BlobClient that behaves like a private store (no overwrite unless allowed). */
function fakeBlobClient() {
  const blobs = new Map<string, { body: Buffer; contentType: string }>();
  const calls: string[] = [];
  const client: BlobClient = {
    async put(pathname, body, { contentType, allowOverwrite }) {
      calls.push(`put ${pathname} ${contentType} overwrite=${allowOverwrite}`);
      if (!allowOverwrite && blobs.has(pathname)) throw new Error("This blob already exists");
      blobs.set(pathname, { body: Buffer.from(body), contentType });
    },
    async get(pathname) {
      calls.push(`get ${pathname}`);
      const blob = blobs.get(pathname);
      return blob ? new Response(Uint8Array.from(blob.body)).body : null;
    },
    async del(pathname) {
      calls.push(`del ${pathname}`);
      blobs.delete(pathname);
    },
    async presignGet(pathname, validUntil, options) {
      calls.push(`presign ${pathname} ${validUntil}`);
      const download = options?.download ? "&download=1" : "";
      return `https://store.private.blob.vercel-storage.com/${pathname}?signed-until=${validUntil}${download}`;
    },
  };
  return { client, blobs, calls };
}

describe("blob storage", () => {
  it("stores under the key itself (the same path as on disk), with its MIME type and without overwriting", async () => {
    const fake = fakeBlobClient();
    const storage = createBlobFileStorage(fake.client);
    await storage.put(KEY, Buffer.from("jpeg bytes"));
    expect(fake.calls).toEqual([`put ${KEY} image/jpeg overwrite=false`]);
    expect(fake.blobs.get(KEY)?.body.toString()).toBe("jpeg bytes");
    await expect(storage.put(KEY, Buffer.from("other"))).rejects.toThrow(/already exists/);
    expect(fake.blobs.get(KEY)?.body.toString()).toBe("jpeg bytes");
  });

  it("reads the bytes back, reports a missing blob as ENOENT and removes idempotently", async () => {
    const fake = fakeBlobClient();
    const storage = createBlobFileStorage(fake.client);
    await storage.put("mechanic-documents/2026/id.pdf", Buffer.from("%PDF-1.4"));
    const data = await storage.read("mechanic-documents/2026/id.pdf");
    expect(Buffer.isBuffer(data) && data.toString()).toBe("%PDF-1.4");
    await storage.remove("mechanic-documents/2026/id.pdf");
    await expect(storage.read("mechanic-documents/2026/id.pdf")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(storage.remove("mechanic-documents/2026/id.pdf")).resolves.toBeUndefined();
  });

  it("signs read URLs that expire 15 minutes from the request's clock, as downloads when asked", async () => {
    const fake = fakeBlobClient();
    const now = Date.parse("2026-10-05T17:00:00.000Z");
    const storage = createBlobFileStorage(fake.client, () => now);
    const url = await storage.signedReadUrl?.(KEY);
    expect(url).toBe(`https://store.private.blob.vercel-storage.com/${KEY}?signed-until=${now + 15 * 60 * 1000}`);
    const download = await storage.signedReadUrl?.("mechanic-documents/2026/id.pdf", { download: true });
    expect(download).toBe(
      `https://store.private.blob.vercel-storage.com/mechanic-documents/2026/id.pdf?signed-until=${now + 15 * 60 * 1000}&download=1`,
    );
  });

  it("refuses malformed keys without calling the store", async () => {
    const fake = fakeBlobClient();
    const storage = createBlobFileStorage(fake.client);
    for (const call of [
      () => storage.put("../x.jpg", Buffer.from("x")),
      () => storage.read("a/../b.jpg"),
      () => storage.remove("/abs.jpg"),
      () => storage.signedReadUrl?.("A.JPG") ?? Promise.resolve(""),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
    expect(fake.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Vercel Blob, over the SDK (mocked)
// ---------------------------------------------------------------------------------

describe("vercelBlobClient", () => {
  beforeEach(() => {
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  it("writes private blobs under the exact pathname, with the given token", async () => {
    sdk.put.mockResolvedValue({});
    const client = vercelBlobClient({ token: "test-token" });
    await client.put(KEY, Buffer.from("x"), { contentType: "image/jpeg", allowOverwrite: false });
    expect(sdk.put).toHaveBeenCalledWith(KEY, Buffer.from("x"), {
      token: "test-token",
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 3600,
    });
  });

  it("reads private blobs (null when missing, an error for anything but 200) and deletes them", async () => {
    const client = vercelBlobClient();
    const stream = new Response("bytes").body;
    sdk.get.mockResolvedValueOnce({ statusCode: 200, stream }).mockResolvedValueOnce(null).mockResolvedValueOnce({ statusCode: 304, stream: null });
    expect(await client.get(KEY)).toBe(stream);
    expect(sdk.get).toHaveBeenCalledWith(KEY, { access: "private" });
    expect(await client.get(KEY)).toBeNull();
    await expect(client.get(KEY)).rejects.toThrow(/answered 304/);
    sdk.del.mockResolvedValue(undefined);
    await client.del(KEY);
    expect(sdk.del).toHaveBeenCalledWith(KEY, {});
  });

  it("signs read URLs locally with one signing token, requested again only when it runs out or failed", async () => {
    const now = Date.now();
    sdk.issueSignedToken.mockImplementation(async (options: { validUntil: number }) => ({
      delegationToken: `delegation-${options.validUntil}`,
      clientSigningToken: "signing-key",
      validUntil: options.validUntil,
    }));
    sdk.presignUrl.mockImplementation(async (_token: unknown, options: { pathname: string; validUntil: number }) => ({
      presignedUrl: `https://store.private.blob.vercel-storage.com/${options.pathname}?until=${options.validUntil}`,
    }));
    sdk.getDownloadUrl.mockImplementation((url: string) => `${url}&download=1`);
    const client = vercelBlobClient({ token: "test-token" });

    const first = await client.presignGet(KEY, now + 15 * 60 * 1000);
    expect(first).toBe(`https://store.private.blob.vercel-storage.com/${KEY}?until=${now + 15 * 60 * 1000}`);
    expect(sdk.issueSignedToken).toHaveBeenCalledTimes(1);
    const [issued] = sdk.issueSignedToken.mock.calls[0] as [{ token: string; operations: string[]; validUntil: number }];
    expect(issued).toMatchObject({ token: "test-token", operations: ["get"] });
    expect(issued.validUntil).toBeGreaterThanOrEqual(now + 60 * 60 * 1000);
    expect(sdk.presignUrl).toHaveBeenCalledWith(expect.objectContaining({ clientSigningToken: "signing-key" }), {
      operation: "get",
      pathname: KEY,
      access: "private",
      validUntil: now + 15 * 60 * 1000,
    });

    await client.presignGet("avatars/2026/a.jpg", now + 20 * 60 * 1000);
    expect(sdk.issueSignedToken).toHaveBeenCalledTimes(1);
    expect(sdk.getDownloadUrl).not.toHaveBeenCalled();
    expect(await client.presignGet("mechanic-documents/2026/id.pdf", now + 60_000, { download: true })).toBe(
      `https://store.private.blob.vercel-storage.com/mechanic-documents/2026/id.pdf?until=${now + 60_000}&download=1`,
    );
    expect(sdk.issueSignedToken).toHaveBeenCalledTimes(1);
    // A URL valid beyond the signing token's lifetime needs a new signing token.
    await client.presignGet("avatars/2026/a.jpg", now + 2 * 60 * 60 * 1000);
    expect(sdk.issueSignedToken).toHaveBeenCalledTimes(2);

    // A failed request is not remembered.
    const failing = vercelBlobClient();
    sdk.issueSignedToken.mockRejectedValueOnce(new Error("Blob API unavailable"));
    await expect(failing.presignGet(KEY, now + 60_000)).rejects.toThrow(/unavailable/);
    await expect(failing.presignGet(KEY, now + 60_000)).resolves.toContain(KEY);
  });
});

// ---------------------------------------------------------------------------------
// Environment switches (read when the modules load)
// ---------------------------------------------------------------------------------

describe("storage configuration", () => {
  const STORAGE_ENV = ["VERCEL", "HOSTED_UPLOAD_MAX_BYTES", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"] as const;

  async function loadWith(env: Partial<Record<(typeof STORAGE_ENV)[number] | "UPLOAD_DIR", string>>) {
    for (const name of STORAGE_ENV) vi.stubEnv(name, "");
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.resetModules();
    const config = await import("@/server/storage/config");
    const { createAppFileStorage } = await import("@/server/storage/app-storage");
    return { ...config, createAppFileStorage };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("locally: disk storage under UPLOAD_DIR, no request budget, the usual per-file limits", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-app-storage-"));
    try {
      const config = await loadWith({ UPLOAD_DIR: root });
      expect(config.STORAGE_DRIVER).toBe("local");
      expect(config.HOSTED_UPLOAD_MAX_BYTES).toBeNull();
      expect(config.uploadBudgetFor("request_photo", 6)).toBeUndefined();
      expect(config.effectiveMaxBytes("request_video")).toBe(UPLOAD_LIMITS.request_video.maxBytes);
      expect(config.effectiveMaxBytes("mechanic_document")).toBe(UPLOAD_LIMITS.mechanic_document.maxBytes);
      const storage = config.createAppFileStorage();
      expect(storage.signedReadUrl).toBeUndefined();
      await storage.put(KEY, Buffer.from("local"));
      expect(fs.readFileSync(path.join(root, ...KEY.split("/")), "utf8")).toBe("local");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("on Vercel: a 4 MB budget per form, pictures shrunk to their share of it, video and PDF limits capped", async () => {
    const config = await loadWith({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test" });
    expect(config.HOSTED_UPLOAD_MAX_BYTES).toBe(4 * MiB);
    expect(config.uploadBudgetFor("request_photo", 6)).toEqual({
      maxRequestBytes: 4 * MiB,
      imageMaxEdgePx: 2048,
      imageTargetBytes: Math.floor((4 * MiB) / 6),
    });
    expect(config.uploadBudgetFor("mechanic_gallery")).toEqual({ maxRequestBytes: 4 * MiB, imageMaxEdgePx: 1600, imageTargetBytes: MiB });
    expect(config.uploadBudgetFor("user_avatar")?.imageMaxEdgePx).toBe(512);
    expect(config.effectiveMaxBytes("request_video")).toBe(4 * MiB);
    expect(config.effectiveMaxBytes("mechanic_document")).toBe(4 * MiB);
    expect(config.effectiveMaxBytes("mechanic_profile_photo")).toBe(4 * MiB);
  });

  it("HOSTED_UPLOAD_MAX_BYTES sets the budget anywhere; a malformed value is ignored", async () => {
    expect((await loadWith({ HOSTED_UPLOAD_MAX_BYTES: "3000000" })).HOSTED_UPLOAD_MAX_BYTES).toBe(3_000_000);
    expect((await loadWith({ HOSTED_UPLOAD_MAX_BYTES: "3000000", VERCEL: "1" })).HOSTED_UPLOAD_MAX_BYTES).toBe(3_000_000);
    expect((await loadWith({ HOSTED_UPLOAD_MAX_BYTES: "4mb" })).HOSTED_UPLOAD_MAX_BYTES).toBeNull();
    expect((await loadWith({ HOSTED_UPLOAD_MAX_BYTES: "0", VERCEL: "1" })).HOSTED_UPLOAD_MAX_BYTES).toBe(4 * MiB);
  });

  it("uses a private Blob store when BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is set", async () => {
    for (const env of [{ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test" }, { BLOB_STORE_ID: "store_test", VERCEL: "1" }]) {
      const config = await loadWith(env);
      expect(config.STORAGE_DRIVER).toBe("blob");
      expect(typeof config.createAppFileStorage().signedReadUrl).toBe("function");
    }
  });

  it("on Vercel without a Blob store, refuses to store files on the deployment's disk", async () => {
    const config = await loadWith({ VERCEL: "1" });
    const storage = config.createAppFileStorage();
    await expect(storage.put(KEY, Buffer.from("x"))).rejects.toThrow(/File storage is not configured/);
    await expect(storage.read(KEY)).rejects.toThrow(/File storage is not configured/);
  });
});
