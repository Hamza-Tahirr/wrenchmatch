import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { blockedPathReason, localSecretValues, scanText } from "../../scripts/check-secrets.mjs";

// Fake credentials are assembled at run time so this file never contains one itself (the
// guard scans every tracked file, this one included).
const fake = {
  github: "ghp" + "_" + "A1b2C3d4".repeat(5),
  githubFineGrained: "github" + "_pat_" + "11ABCDEFG0".repeat(6),
  blob: "vercel" + "_blob_rw_" + "AbCdEf123456" + "_" + "Z9y8X7w6".repeat(4),
  jwt: "eyJ" + "hbGciOiJFZERTQSJ9" + ".eyJ" + "pYXQiOjE3OTExOTY3MzR9" + "." + "s1gNaTuRe-Value_xyz123",
  privateKey: "-----BEGIN " + "OPENSSH PRIVATE KEY-----",
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  aiProviderKey: "sk-" + "ant-" + "api03-" + "x".repeat(30),
  libsqlUrl: "libsql://db-org.turso.io?" + "authToken=" + "abcdefghijklmnop",
};

describe("scanText", () => {
  it.each(Object.entries(fake))("finds a %s", (_kind, secret) => {
    const findings = scanText(`const value = "${secret}";`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(1);
  });

  it("never prints the secret itself", () => {
    const [finding] = scanText(`token=${fake.github}`);
    expect(finding?.preview).not.toContain(fake.github.slice(4));
    expect(finding?.preview).toMatch(/^ghp_…\(\d+ chars\)$/);
  });

  it("ignores ordinary code, placeholders and the sample password", () => {
    const text = [
      'const url = "libsql://wrenchmatch-db-<org>.aws-ap-south-1.turso.io";',
      'export const DEMO_PASSWORD = "repair-pilot-2026";',
      "BLOB_READ_WRITE_TOKEN=",
      'const token = "vercel_blob_rw_test";',
      "//registry.npmjs.org/:_authToken=${NPM_TOKEN}",
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("skips lines marked as deliberate examples", () => {
    expect(scanText(`example: ${fake.aws} // secret-scan: allow`)).toEqual([]);
  });

  it("catches the exact value of a local secret in any format", () => {
    const local = [{ key: "TURSO_AUTH_TOKEN", value: "plain-looking-but-real-1234" }];
    const findings = scanText("note: plain-looking-but-real-1234", local);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toContain("TURSO_AUTH_TOKEN");
  });
});

describe("blockedPathReason", () => {
  it.each([".env", ".env.local", ".env.vercel", "config/.env.production", ".vercel/project.json", ".data/app.db", "certs/server.pem", "deploy.key", "id_rsa", "backup.sqlite", "app.db-wal"])(
    "blocks %s",
    (file) => expect(blockedPathReason(file)).not.toBeNull(),
  );

  it.each([".env.example", "README.md", "src/server/db/client.ts", "id_rsa.pub", "docs/DEPLOY.md", "db/migrations/0001_init.sql"])(
    "allows %s",
    (file) => expect(blockedPathReason(file)).toBeNull(),
  );
});

describe("localSecretValues", () => {
  let dir = "";
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads secret-like keys from local env files and skips the rest", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-"));
    fs.writeFileSync(
      path.join(dir, ".env.vercel"),
      ['TURSO_AUTH_TOKEN="abc123def456ghi789"', "VERCEL_ENV=production", "BLOB_READ_WRITE_TOKEN=short", "export API_KEY=key-0123456789ab"].join("\n"),
    );
    const values = localSecretValues(dir);
    expect(values.map((entry) => entry.key).sort()).toEqual(["API_KEY", "TURSO_AUTH_TOKEN"]);
    expect(values.find((entry) => entry.key === "TURSO_AUTH_TOKEN")?.value).toBe("abc123def456ghi789");
  });
});
