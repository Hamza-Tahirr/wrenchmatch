// Where npm run db:push:remote and db:migrate:remote find the hosted database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readRemoteTarget } from "../../scripts/db-remote-target";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-remote-"));
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (file: string, text: string) => fs.writeFileSync(path.join(dir, file), text);

describe("readRemoteTarget", () => {
  it("takes TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from the environment first", () => {
    write(".env.vercel", 'TURSO_DATABASE_URL="libsql://from-file.turso.io"\nTURSO_AUTH_TOKEN="file-token"\n');
    vi.stubEnv("TURSO_DATABASE_URL", " libsql://from-env.turso.io ");
    vi.stubEnv("TURSO_AUTH_TOKEN", "env-token");
    expect(readRemoteTarget(dir)).toEqual({ url: "libsql://from-env.turso.io", authToken: "env-token", source: "the environment" });
  });

  it("falls back to .env.vercel without loading anything from it into process.env", () => {
    write(".env.vercel", '# Created by Vercel CLI\nOTHER_SETTING="1"\nTURSO_AUTH_TOKEN="file-token"\nTURSO_DATABASE_URL="libsql://from-file.turso.io"\n');
    expect(readRemoteTarget(dir)).toEqual({ url: "libsql://from-file.turso.io", authToken: "file-token", source: ".env.vercel" });
    expect(process.env.OTHER_SETTING).toBeUndefined();
  });

  it("finds nothing without either, and never reads .env.production.local", () => {
    write(".env.production.local", 'TURSO_DATABASE_URL="libsql://production-local.turso.io"\n');
    expect(readRemoteTarget(dir)).toBeNull();
    write(".env.vercel", 'BLOB_READ_WRITE_TOKEN="x"\n');
    expect(readRemoteTarget(dir)).toBeNull();
  });
});
