// scripts/push-uploads-remote.ts (npm run uploads:push:remote): where the Blob token comes
// from, which local files are sent, and that every file goes up under its own key,
// overwriting, with failures reported instead of stopping the run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/format";
import type { BlobClient } from "@/server/storage/blob-storage";
import { contentTypeForKey, isStorageKey } from "@/server/storage/keys";
import { UPLOAD_FOLDERS } from "@/server/storage/uploads";
import { listLocalUploads, pushUploads, readBlobToken, type LocalUpload } from "../../scripts/push-uploads-remote";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-push-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  const target = path.join(dir, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

describe("readBlobToken", () => {
  it("prefers the environment, then reads only BLOB_READ_WRITE_TOKEN from the env file", () => {
    const envFile = path.join(dir, ".env.vercel");
    fs.writeFileSync(envFile, 'VERCEL="1"\nBLOB_READ_WRITE_TOKEN="vercel_blob_rw_from_file"\nTURSO_AUTH_TOKEN="other"\n');
    expect(readBlobToken({ BLOB_READ_WRITE_TOKEN: " vercel_blob_rw_from_env " }, envFile)).toEqual({
      token: "vercel_blob_rw_from_env",
      source: "the environment",
    });
    expect(readBlobToken({}, envFile)).toEqual({ token: "vercel_blob_rw_from_file", source: ".env.vercel" });
    expect(readBlobToken({ BLOB_READ_WRITE_TOKEN: "  " }, envFile)?.source).toBe(".env.vercel");
  });

  it("returns null when neither has a token", () => {
    expect(readBlobToken({}, path.join(dir, "missing.env"))).toBeNull();
    fs.writeFileSync(path.join(dir, ".env.vercel"), "TURSO_DATABASE_URL=libsql://example\n");
    expect(readBlobToken({}, path.join(dir, ".env.vercel"))).toBeNull();
  });
});

describe("listLocalUploads", () => {
  it("lists the stored files of the app's upload folders by key, and skips everything else", () => {
    write("request-photos/2026/b.jpg", "bb");
    write("request-photos/2026/a.jpg", "a");
    write("mechanic-documents/2025/id.pdf", "%PDF");
    write("avatars/2026/Thumbs.db", "junk");
    write("unrelated/2026/c.jpg", "not an upload folder");
    write("notes.txt", "not in a folder");

    const { uploads, skipped } = listLocalUploads(dir, UPLOAD_FOLDERS, isStorageKey);
    expect(uploads.map(({ key, size }) => [key, size])).toEqual([
      ["mechanic-documents/2025/id.pdf", 4],
      ["request-photos/2026/a.jpg", 1],
      ["request-photos/2026/b.jpg", 2],
    ]);
    expect(uploads[1].fullPath).toBe(path.join(dir, "request-photos", "2026", "a.jpg"));
    expect(skipped).toEqual(["avatars/2026/Thumbs.db"]);
  });

  it("finds nothing in an empty or missing directory", () => {
    expect(listLocalUploads(path.join(dir, "missing"), UPLOAD_FOLDERS, isStorageKey)).toEqual({ uploads: [], skipped: [] });
  });
});

describe("pushUploads", () => {
  function recordingClient(failFor: ReadonlySet<string> = new Set()) {
    const stored = new Map<string, { body: string; contentType: string; allowOverwrite: boolean }>();
    let inFlight = 0;
    let maxInFlight = 0;
    const client: BlobClient = {
      async put(pathname, body, { contentType, allowOverwrite }) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        if (failFor.has(pathname)) throw new Error("Vercel Blob: service unavailable");
        stored.set(pathname, { body: body.toString(), contentType, allowOverwrite });
      },
      get: async () => null,
      del: async () => undefined,
      presignGet: async () => "",
    };
    return { client, stored, maxInFlight: () => maxInFlight };
  }

  function uploadsOf(keys: readonly string[]): LocalUpload[] {
    for (const key of keys) write(key, `bytes of ${key}`);
    return listLocalUploads(dir, UPLOAD_FOLDERS, isStorageKey).uploads;
  }

  it("stores every file under its key with its content type, overwriting, a few at a time", async () => {
    const keys = Array.from({ length: 9 }, (_, index) => `gallery-photos/2026/photo-${index}.jpg`).concat("request-videos/2026/clip.mp4");
    const uploads = uploadsOf(keys);
    const recorder = recordingClient();
    const lines: string[] = [];
    const result = await pushUploads({ uploads, client: recorder.client, contentTypeFor: contentTypeForKey, log: (line) => lines.push(line), formatSize: formatBytes, concurrency: 3 });

    expect(result).toEqual({ uploaded: 10, bytes: uploads.reduce((sum, upload) => sum + upload.size, 0), failed: [] });
    expect([...recorder.stored.keys()].sort()).toEqual([...keys].sort());
    expect(recorder.stored.get("request-videos/2026/clip.mp4")).toEqual({
      body: "bytes of request-videos/2026/clip.mp4",
      contentType: "video/mp4",
      allowOverwrite: true,
    });
    expect(recorder.stored.get("gallery-photos/2026/photo-0.jpg")?.contentType).toBe("image/jpeg");
    expect(recorder.maxInFlight()).toBeLessThanOrEqual(3);
    expect(recorder.maxInFlight()).toBeGreaterThanOrEqual(2);
    expect(lines).toHaveLength(10);
    expect(lines[9]).toMatch(/^\[10\/10\] \S+ {2}\d+ bytes$/);
  });

  it("reports a failed file and carries on with the rest", async () => {
    const uploads = uploadsOf(["avatars/2026/a.jpg", "avatars/2026/b.jpg", "avatars/2026/c.jpg"]);
    const recorder = recordingClient(new Set(["avatars/2026/b.jpg"]));
    const lines: string[] = [];
    const result = await pushUploads({ uploads, client: recorder.client, contentTypeFor: contentTypeForKey, log: (line) => lines.push(line), formatSize: formatBytes });

    expect(result.uploaded).toBe(2);
    expect(result.failed).toEqual([{ key: "avatars/2026/b.jpg", error: "Vercel Blob: service unavailable" }]);
    expect([...recorder.stored.keys()].sort()).toEqual(["avatars/2026/a.jpg", "avatars/2026/c.jpg"]);
    expect(lines.some((line) => line.includes("avatars/2026/b.jpg  FAILED: Vercel Blob: service unavailable"))).toBe(true);
  });
});
