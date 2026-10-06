import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { assertStorageKey, InvalidStorageKeyError } from "./keys";
import type { FileStorage } from "./types";

export { InvalidStorageKeyError } from "./keys";

/** Resolves a storage key to an absolute path inside `root`, or throws InvalidStorageKeyError. */
export function resolveStorageKey(root: string, key: string): string {
  assertStorageKey(key);
  const fullPath = path.resolve(root, ...key.split("/"));
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidStorageKeyError(key);
  }
  return fullPath;
}

/** FileStorage on the local disk under `rootDir` (UPLOAD_DIR in the app; never under public/). */
export function createLocalFileStorage(rootDir: string): FileStorage {
  const root = path.resolve(rootDir);
  return {
    async put(key, data) {
      const fullPath = resolveStorageKey(root, key);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      // "wx" fails with EEXIST instead of overwriting.
      await fs.writeFile(fullPath, data, { flag: "wx" });
    },
    async read(key) {
      return fs.readFile(resolveStorageKey(root, key));
    },
    async remove(key) {
      await fs.rm(resolveStorageKey(root, key), { force: true });
    },
  };
}
