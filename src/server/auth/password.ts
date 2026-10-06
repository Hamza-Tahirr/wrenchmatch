import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Password hashing with scrypt from node:crypto. Stored hashes describe their own
// parameters, so the cost can be raised later without invalidating existing accounts:
//
//   scrypt$N=32768,r=8,p=1$<16-byte salt, base64url>$<64-byte key, base64url>
//
// Passwords are NFKC-normalized first, so the same characters typed on different
// keyboards (composed vs decomposed accents, full-width digits) produce the same hash.

const ALGORITHM = "scrypt";

export type ScryptParams = { readonly N: number; readonly r: number; readonly p: number };

/** Cost for new hashes: N = 2^15, r = 8, p = 1 (about 32 MiB of memory per hash). */
export const SCRYPT_PARAMS: ScryptParams = { N: 32_768, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// scrypt needs about 128 * N * r bytes. At the defaults that is exactly Node's default
// maxmem (32 MiB), which Node rejects, so the limit is set explicitly with headroom.
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

/** Longest password accepted here; forms enforce a lower limit (see validation.ts). */
const MAX_PASSWORD_CHARS = 1024;

// Bounds for parameters read back from a stored hash, so a corrupted or hostile row
// cannot make verification allocate unbounded memory or CPU. The key length is fixed:
// scrypt output for a shorter length is a prefix of the longer one, so a truncated key
// would otherwise still verify.
const PARAM_BOUNDS = {
  minN: 2 ** 10,
  maxN: 2 ** 20,
  maxR: 32,
  maxP: 16,
  minSaltBytes: SALT_BYTES,
  maxSaltBytes: 64,
} as const;

const PARAMS_PATTERN = /^N=(\d{1,8}),r=(\d{1,3}),p=(\d{1,3})$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type ParsedHash = { params: ScryptParams; salt: Buffer; key: Buffer };

function deriveKey(password: string, salt: Buffer, params: ScryptParams, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY_BYTES },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function isUsablePassword(password: unknown): password is string {
  return typeof password === "string" && password.length > 0 && password.length <= MAX_PASSWORD_CHARS;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function decodeBase64Url(value: string | undefined): Buffer | null {
  if (!value || !BASE64URL_PATTERN.test(value)) return null;
  return Buffer.from(value, "base64url");
}

function parseHash(stored: unknown): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return null;

  const match = PARAMS_PATTERN.exec(parts[1] ?? "");
  if (!match) return null;
  const params: ScryptParams = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  if (
    !isPowerOfTwo(params.N) ||
    params.N < PARAM_BOUNDS.minN ||
    params.N > PARAM_BOUNDS.maxN ||
    params.r < 1 ||
    params.r > PARAM_BOUNDS.maxR ||
    params.p < 1 ||
    params.p > PARAM_BOUNDS.maxP ||
    128 * params.N * params.r > MAX_MEMORY_BYTES
  ) {
    return null;
  }

  const salt = decodeBase64Url(parts[2]);
  const key = decodeBase64Url(parts[3]);
  if (
    !salt ||
    !key ||
    salt.length < PARAM_BOUNDS.minSaltBytes ||
    salt.length > PARAM_BOUNDS.maxSaltBytes ||
    key.length !== KEY_BYTES
  ) {
    return null;
  }
  return { params, salt, key };
}

/** Hashes a password for storage in users.password_hash. */
export async function hashPassword(password: string): Promise<string> {
  if (!isUsablePassword(password)) {
    throw new RangeError(`Passwords must be 1-${MAX_PASSWORD_CHARS} characters long.`);
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, SCRYPT_PARAMS, KEY_BYTES);
  const { N, r, p } = SCRYPT_PARAMS;
  return [ALGORITHM, `N=${N},r=${r},p=${p}`, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/**
 * True when `password` matches `stored` (constant-time comparison). Returns false, never
 * throws, for a wrong password, an empty or oversized password, or a malformed hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isUsablePassword(password)) return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;

  let candidate: Buffer;
  try {
    candidate = await deriveKey(password, parsed.salt, parsed.params, parsed.key.length);
  } catch {
    return false;
  }
  return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
}
