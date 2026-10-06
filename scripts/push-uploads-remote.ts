// Copies the local uploads to the hosted site's Vercel Blob store (npm run uploads:push:remote).
// Every stored file under UPLOAD_DIR (default .data/uploads) goes up under the same pathname,
// its storage key ("request-photos/2026/<file id>.jpg"), so a database pushed from the same
// seed finds every file. Existing blobs are overwritten, so running it again is safe. Only the
// app's upload folders are read, and only files named like storage keys are sent.
//
//   npm run uploads:push:remote               upload everything
//   npm run uploads:push:remote -- --dry-run  list what would be uploaded
//
// The token is BLOB_READ_WRITE_TOKEN from the environment, else from .env.vercel (written by
// `vercel env pull .env.vercel --environment=production`). Nothing else is read from that
// file, and .env.production.local is never loaded: the local production server reads it.
import { isMainModule } from "../src/server/db/script-runtime";

import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import type { BlobClient } from "../src/server/storage/blob-storage";

/** Where `vercel env pull` writes the production variables, relative to the project root. */
export const DEPLOY_ENV_FILE = ".env.vercel";

/** Uploads sent at the same time. */
const CONCURRENCY = 4;

export type LocalUpload = { key: string; fullPath: string; size: number };

export type BlobToken = { token: string; source: string };

/** BLOB_READ_WRITE_TOKEN from `env`, else from the dotenv file `envFile`; null when neither has one. */
export function readBlobToken(env: NodeJS.Dict<string>, envFile: string): BlobToken | null {
  const fromEnv = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: "the environment" };
  if (!fs.existsSync(envFile)) return null;
  const fromFile = parseEnv(fs.readFileSync(envFile, "utf8")).BLOB_READ_WRITE_TOKEN?.trim();
  return fromFile ? { token: fromFile, source: path.basename(envFile) } : null;
}

/**
 * The files under each of `folders` (direct children of `uploadDir`, e.g. "request-photos"),
 * sorted by key. Files whose path is not a storage key (`isKey`) are listed in `skipped`.
 */
export function listLocalUploads(
  uploadDir: string,
  folders: readonly string[],
  isKey: (key: string) => boolean,
): { uploads: LocalUpload[]; skipped: string[] } {
  const root = path.resolve(uploadDir);
  const uploads: LocalUpload[] = [];
  const skipped: string[] = [];
  for (const folder of folders) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(entry.parentPath, entry.name);
      const key = path.relative(root, fullPath).split(path.sep).join("/");
      if (isKey(key)) uploads.push({ key, fullPath, size: fs.statSync(fullPath).size });
      else skipped.push(key);
    }
  }
  uploads.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { uploads, skipped };
}

export type PushResult = { uploaded: number; bytes: number; failed: { key: string; error: string }[] };

/**
 * Stores every upload in the Blob store under its key, overwriting what is there, a few at a
 * time. A failed file is reported and the rest carry on; `log` gets one line per file.
 */
export async function pushUploads(options: {
  uploads: readonly LocalUpload[];
  client: BlobClient;
  contentTypeFor: (key: string) => string;
  log: (line: string) => void;
  formatSize: (bytes: number) => string;
  concurrency?: number;
}): Promise<PushResult> {
  const { uploads, client, contentTypeFor, log, formatSize } = options;
  const result: PushResult = { uploaded: 0, bytes: 0, failed: [] };
  const width = String(uploads.length).length;
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < uploads.length) {
      const upload = uploads[next];
      next += 1;
      let outcome: string;
      try {
        const body = await fs.promises.readFile(upload.fullPath);
        await client.put(upload.key, body, { contentType: contentTypeFor(upload.key), allowOverwrite: true });
        result.uploaded += 1;
        result.bytes += body.byteLength;
        outcome = formatSize(body.byteLength);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.failed.push({ key: upload.key, error: message });
        outcome = `FAILED: ${message}`;
      }
      done += 1;
      log(`[${String(done).padStart(width)}/${uploads.length}] ${upload.key}  ${outcome}`);
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? CONCURRENCY, uploads.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return result;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { UPLOAD_DIR } = await import("../src/server/config");
  const { formatBytes } = await import("../src/lib/format");
  const { contentTypeForKey, isStorageKey } = await import("../src/server/storage/keys");
  const { UPLOAD_FOLDERS } = await import("../src/server/storage/uploads");
  const display = path.relative(process.cwd(), UPLOAD_DIR) || UPLOAD_DIR;

  const { uploads, skipped } = listLocalUploads(UPLOAD_DIR, UPLOAD_FOLDERS, isStorageKey);
  for (const key of skipped) console.warn(`Skipping ${key}: not a stored upload.`);
  if (uploads.length === 0) {
    throw new Error(`No uploads found in ${display}. Run "npm run db:reset" first, or set UPLOAD_DIR.`);
  }
  const total = uploads.reduce((sum, upload) => sum + upload.size, 0);

  if (dryRun) {
    for (const upload of uploads) console.log(`${upload.key}  ${formatBytes(upload.size)}`);
    console.log(`Dry run: ${uploads.length} files (${formatBytes(total)}) in ${display} would be uploaded.`);
    return;
  }

  const blobToken = readBlobToken(process.env, path.join(process.cwd(), DEPLOY_ENV_FILE));
  if (!blobToken) {
    throw new Error(
      `BLOB_READ_WRITE_TOKEN is not set. Set it in the environment, or pull the production variables with ` +
        `"vercel env pull ${DEPLOY_ENV_FILE} --environment=production".`,
    );
  }
  const { vercelBlobClient } = await import("../src/server/storage/blob-storage");
  console.log(
    `Uploading ${uploads.length} files (${formatBytes(total)}) from ${display} to Vercel Blob (token from ${blobToken.source}).`,
  );
  const started = Date.now();
  const result = await pushUploads({
    uploads,
    client: vercelBlobClient({ token: blobToken.token }),
    contentTypeFor: contentTypeForKey,
    log: (line) => console.log(line),
    formatSize: formatBytes,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Uploaded ${result.uploaded} of ${uploads.length} files (${formatBytes(result.bytes)}) in ${seconds} s.`);
  if (result.failed.length > 0) {
    throw new Error(`${result.failed.length} file(s) failed to upload; run the command again to retry them.`);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
