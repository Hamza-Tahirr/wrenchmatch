import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, SCRYPT_PARAMS, verifyPassword } from "@/server/auth/password";

/** A stored hash in the same format, built with arbitrary parameters. */
function handMadeHash(password: string, params: { N: number; r: number; p: number }, keyLength = 64): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, keyLength, { ...params, maxmem: 256 * 1024 * 1024 });
  return `scrypt$N=${params.N},r=${params.r},p=${params.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function replacePart(hash: string, index: number, value: string): string {
  const parts = hash.split("$");
  parts[index] = value;
  return parts.join("$");
}

describe("hashPassword", () => {
  it("produces a self-describing scrypt hash: N=2^15, r=8, p=1, 16-byte salt, 64-byte key", async () => {
    const hash = await hashPassword("correct horse battery");
    const [algorithm, params, salt, key, ...rest] = hash.split("$");
    expect(rest).toEqual([]);
    expect(algorithm).toBe("scrypt");
    expect(params).toBe("N=32768,r=8,p=1");
    expect(SCRYPT_PARAMS).toEqual({ N: 32_768, r: 8, p: 1 });
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(key, "base64url")).toHaveLength(64);
    expect(hash).not.toContain("correct horse battery");
  });

  it("uses a fresh random salt for every hash", async () => {
    const first = await hashPassword("same password here");
    const second = await hashPassword("same password here");
    expect(first).not.toBe(second);
    expect(await verifyPassword("same password here", first)).toBe(true);
    expect(await verifyPassword("same password here", second)).toBe(true);
  });

  it("refuses empty and absurdly long passwords", async () => {
    await expect(hashPassword("")).rejects.toThrow(RangeError);
    await expect(hashPassword("x".repeat(1025))).rejects.toThrow(RangeError);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects any other", async () => {
    const hash = await hashPassword("repair-pilot-2026");
    expect(await verifyPassword("repair-pilot-2026", hash)).toBe(true);
    expect(await verifyPassword("demo-repair-2027", hash)).toBe(false);
    expect(await verifyPassword("DEMO-REPAIR-2026", hash)).toBe(false);
    expect(await verifyPassword("repair-pilot-2026 ", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("x".repeat(2000), hash)).toBe(false);
  });

  it("normalizes Unicode, so composed and decomposed characters match", async () => {
    const composed = "café-au-lait-42";
    const decomposed = "café-au-lait-42";
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("verifies hashes made with other cost parameters, read from the hash itself", async () => {
    const hash = handMadeHash("older-weaker-hash", { N: 16_384, r: 8, p: 1 });
    expect(await verifyPassword("older-weaker-hash", hash)).toBe(true);
    expect(await verifyPassword("something else", hash)).toBe(false);
  });

  it("requires the full 64-byte key (a shorter scrypt output is a prefix of the longer one)", async () => {
    expect(await verifyPassword("short-key-hash", handMadeHash("short-key-hash", SCRYPT_PARAMS, 32))).toBe(false);
  });

  it("rejects a hash whose salt or key was altered", async () => {
    const hash = await hashPassword("tamper-evident-1");
    const [, , salt, key] = hash.split("$");
    const flip = (value: string) => {
      const bytes = Buffer.from(value, "base64url");
      bytes[0] ^= 0xff;
      return bytes.toString("base64url");
    };
    expect(await verifyPassword("tamper-evident-1", replacePart(hash, 2, flip(salt)))).toBe(false);
    expect(await verifyPassword("tamper-evident-1", replacePart(hash, 3, flip(key)))).toBe(false);
    expect(await verifyPassword("tamper-evident-1", replacePart(hash, 3, key.slice(0, -4)))).toBe(false);
  });

  it("returns false, without throwing, for malformed or hostile hashes", async () => {
    const good = await hashPassword("well-formed-pw");
    const malformed = [
      "",
      "plaintext-password",
      "bcrypt$N=32768,r=8,p=1$c2FsdA$a2V5",
      "scrypt$N=32768,r=8,p=1$only-three-parts",
      replacePart(good, 0, "SCRYPT"),
      replacePart(good, 1, "N=32768,r=8"),
      replacePart(good, 1, "N=30000,r=8,p=1"), // N must be a power of two
      replacePart(good, 1, "N=2097152,r=8,p=1"), // N = 2^21: above the bound
      replacePart(good, 1, "N=65536,r=16,p=1"), // needs 128 MiB: above the memory limit
      replacePart(good, 1, "N=32768,r=0,p=1"),
      replacePart(good, 1, "N=32768,r=8,p=99"),
      replacePart(good, 2, "not base64!"),
      replacePart(good, 2, "c2FsdA"), // 4-byte salt
      replacePart(good, 3, "a2V5"), // 3-byte key
      "test-placeholder-not-a-real-password-hash",
    ];
    for (const hash of malformed) {
      expect(await verifyPassword("well-formed-pw", hash), hash).toBe(false);
    }
  });
});
