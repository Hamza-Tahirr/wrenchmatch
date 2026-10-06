import "server-only";

import type { IssuedSignedToken } from "@vercel/blob";

import { BLOB_CACHE_MAX_AGE_SECONDS, SIGNED_URL_TTL_SECONDS } from "./config";
import { assertStorageKey, contentTypeForKey } from "./keys";
import type { FileStorage } from "./types";

// FileStorage on a private Vercel Blob store (used when BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID
// is set, see app-storage.ts). Blob pathnames are the storage keys themselves, the same paths
// the files have under UPLOAD_DIR locally, so `npm run uploads:push:remote` copies the seeded
// files one to one. The store must be created with private access: nothing in it can be read
// without credentials, and browsers only ever get short-lived signed URLs, from
// GET /api/files/[id] after its access check.

/** The Blob operations the adapter uses: vercelBlobClient() in the app, an in-memory fake in tests. */
export type BlobClient = {
  /** Stores `body` at `pathname`; unless `allowOverwrite`, rejects when the pathname exists. */
  put(pathname: string, body: Buffer, options: { contentType: string; allowOverwrite: boolean }): Promise<void>;
  /** The blob's bytes, or null when nothing is stored at `pathname`. */
  get(pathname: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Deletes the blob; succeeds when it is already gone. */
  del(pathname: string): Promise<void>;
  /**
   * A URL anyone holding it can GET the blob from until `validUntil` (ms since the epoch); with
   * `download`, browsers save the file instead of showing it.
   */
  presignGet(pathname: string, validUntil: number, options?: { download?: boolean }): Promise<string>;
};

/** The error local storage gives for a missing file (fs ENOENT), so callers treat both alike. */
function missingFile(key: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`No stored file at ${key}`);
  error.code = "ENOENT";
  return error;
}

/** FileStorage on Vercel Blob through `client`. `now` (ms) dates the signed URLs; tests fix it. */
export function createBlobFileStorage(client: BlobClient, now: () => number = Date.now): FileStorage {
  return {
    async put(key, data) {
      assertStorageKey(key);
      await client.put(key, data, { contentType: contentTypeForKey(key), allowOverwrite: false });
    },
    async read(key) {
      assertStorageKey(key);
      const stream = await client.get(key);
      if (!stream) throw missingFile(key);
      return Buffer.from(await new Response(stream).arrayBuffer());
    },
    async remove(key) {
      assertStorageKey(key);
      await client.del(key);
    },
    async signedReadUrl(key, options) {
      assertStorageKey(key);
      return client.presignGet(key, now() + SIGNED_URL_TTL_SECONDS * 1000, options);
    },
  };
}

type BlobSdk = typeof import("@vercel/blob");

let sdk: Promise<BlobSdk> | undefined;

/** @vercel/blob, loaded on first use: runs on local storage never load it. */
function loadSdk(): Promise<BlobSdk> {
  sdk ??= import("@vercel/blob");
  return sdk;
}

/** Signing material is requested for this long and reused for every URL in that time. */
const SIGNING_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/**
 * BlobClient on @vercel/blob for a private store. With `token` (a read-write token, e.g. in a
 * script), that token is used; without it, the SDK signs in itself: with Vercel's OIDC token
 * and BLOB_STORE_ID when both are set, otherwise with BLOB_READ_WRITE_TOKEN.
 */
export function vercelBlobClient(options: { token?: string } = {}): BlobClient {
  const auth = options.token ? { token: options.token } : {};
  // issueSignedToken is a request to the Blob API; its result signs any number of URLs
  // locally, so it is reused for every URL that expires before it does (a failed request is
  // forgotten).
  let signing: { token: Promise<IssuedSignedToken>; validUntil: number } | null = null;

  function signingToken(neededUntil: number): Promise<IssuedSignedToken> {
    if (!signing || signing.validUntil < neededUntil) {
      const validUntil = Math.max(neededUntil, Date.now() + SIGNING_TOKEN_LIFETIME_MS);
      const token = loadSdk().then(({ issueSignedToken }) => issueSignedToken({ ...auth, operations: ["get"], validUntil }));
      const entry = { token, validUntil };
      signing = entry;
      token.catch(() => {
        if (signing === entry) signing = null;
      });
    }
    return signing.token;
  }

  return {
    async put(pathname, body, { contentType, allowOverwrite }) {
      const { put } = await loadSdk();
      await put(pathname, body, {
        ...auth,
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite,
        cacheControlMaxAge: BLOB_CACHE_MAX_AGE_SECONDS,
      });
    },
    async get(pathname) {
      const { get } = await loadSdk();
      const result = await get(pathname, { ...auth, access: "private" });
      if (!result) return null;
      if (result.statusCode !== 200) throw new Error(`Vercel Blob answered ${result.statusCode} for ${pathname}`);
      return result.stream;
    },
    async del(pathname) {
      const { del } = await loadSdk();
      await del(pathname, auth);
    },
    async presignGet(pathname, validUntil, options) {
      const token = await signingToken(validUntil);
      const { getDownloadUrl, presignUrl } = await loadSdk();
      const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
      // "download=1" is not part of the signature; the Blob CDN then answers with an attachment.
      return options?.download ? getDownloadUrl(presignedUrl) : presignedUrl;
    },
  };
}
