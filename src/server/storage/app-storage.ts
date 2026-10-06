import "server-only";

import { UPLOAD_DIR } from "@/server/config";

import { createBlobFileStorage, vercelBlobClient } from "./blob-storage";
import { ON_VERCEL, STORAGE_DRIVER } from "./config";
import { createLocalFileStorage } from "./local-storage";
import type { FileStorage } from "./types";

/**
 * The app's file storage (for createAppContext): a private Vercel Blob store when
 * BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is set, otherwise the local disk under UPLOAD_DIR.
 * On Vercel without a Blob store every call fails with a message saying so, since the
 * deployment's disk is read-only and nothing written there would last.
 */
export function createAppFileStorage(): FileStorage {
  if (STORAGE_DRIVER === "blob") return createBlobFileStorage(vercelBlobClient());
  if (ON_VERCEL) return unconfiguredStorage();
  return createLocalFileStorage(UPLOAD_DIR);
}

function unconfiguredStorage(): FileStorage {
  const fail = async (): Promise<never> => {
    throw new Error(
      "File storage is not configured: connect a private Vercel Blob store to the project (BLOB_STORE_ID) or set BLOB_READ_WRITE_TOKEN.",
    );
  };
  return { put: fail, read: fail, remove: fail };
}
