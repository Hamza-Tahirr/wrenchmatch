// Accounts, sessions and redirects: signup never creates admins, roles never change, login
// success/failure/rate limits, one-click sample logins, session expiry and logout, and
// "next" parameter handling.
import { createHash } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEMO_PASSWORD } from "@/server/auth/demo-accounts";
import { ACCOUNT_DISABLED_MESSAGE, INVALID_CREDENTIALS_MESSAGE, logIn, logInDemoAccount } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import {
  accessDeniedPath,
  loginPath,
  parseRoleList,
  postLoginPath,
  postSignupPath,
  sanitizeNextPath,
  signupPath,
  type SignupRole,
} from "@/server/auth/redirects";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  hashSessionToken,
  lookupSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/server/auth/session";
import { isDuplicateEmailError, signUp, type SignUpInput } from "@/server/auth/signup";
import { signupSchema } from "@/server/auth/validation";
import { addDays, addMinutes } from "@/server/clock";
import type { Viewer } from "@/server/context";
import { DomainError, mapDbError } from "@/server/errors";
import { createTestContext, withNow, type TestContext } from "../support/db";
import { createUser } from "../support/factories";

const PASSWORD = "correct-horse-staple-9";
const IP = "203.0.113.7";

let t: TestContext;

beforeEach(() => {
  t = createTestContext();
});

afterEach(async () => {
  await t.cleanup();
});

const count = (sql: string, ...params: unknown[]) =>
  (t.sqlite.prepare(sql).get(...params) as { n: number }).n;

async function userWithPassword(role: Viewer["role"], email: string, password = PASSWORD): Promise<Viewer> {
  return createUser(t.ctx, { role, email, passwordHash: await hashPassword(password) });
}

function signupInput(overrides: Partial<SignUpInput> = {}): SignUpInput {
  return {
    role: "customer",
    displayName: "Riley",
    email: "riley@example.test",
    password: PASSWORD,
    ip: IP,
    ...overrides,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error("expected a DomainError");
}

// ---------------------------------------------------------------------------------
// Signup and roles
// ---------------------------------------------------------------------------------

describe("signUp", () => {
  it("creates a customer account that is verified at once, logged in, audited and welcomed", async () => {
    const { viewer, token } = await signUp(t.ctx, signupInput({ email: "  Riley@Example.TEST " }));
    expect(viewer).toMatchObject({ role: "customer", email: "riley@example.test", displayName: "Riley" });

    const user = t.sqlite.prepare("SELECT * FROM users WHERE id = ?").get(viewer.id) as Record<string, unknown>;
    expect(user).toMatchObject({
      email: "riley@example.test",
      role: "customer",
      email_verified_at: t.ctx.now.toISOString(),
      is_demo_account: 0,
      disabled_at: null,
    });
    expect(String(user.password_hash)).toMatch(/^scrypt\$N=32768,r=8,p=1\$/);
    expect(String(user.password_hash)).not.toContain(PASSWORD);

    expect(await lookupSession(t.ctx, token)).toEqual(viewer);
    expect(count("SELECT count(*) AS n FROM audit_events WHERE action = 'account.signup' AND entity_id = ?", viewer.id)).toBe(1);
    expect(count("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND link_path = '/request'", viewer.id)).toBe(1);
  });

  it("creates a mechanic account whose welcome points to the application", async () => {
    const { viewer } = await signUp(t.ctx, signupInput({ role: "mechanic", email: "new-mechanic@example.test" }));
    expect(viewer.role).toBe("mechanic");
    expect(count("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND link_path = '/mechanic/apply'", viewer.id)).toBe(1);
  });

  it("can never create an admin account", async () => {
    const error = await rejectionOf(signUp(t.ctx, signupInput({ role: "admin" as SignupRole })));
    expect(error.code).toBe("forbidden");
    expect(count("SELECT count(*) AS n FROM users")).toBe(0);

    const parsed = signupSchema.safeParse({
      role: "admin",
      displayName: "Mallory",
      email: "mallory@example.test",
      password: PASSWORD,
      confirmPassword: PASSWORD,
      acceptTerms: "on",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("role");
  });

  it("validates the form: password length and confirmation, terms, email", () => {
    const result = signupSchema.safeParse({
      role: "customer",
      displayName: "  ",
      email: "not-an-email",
      password: "short",
      confirmPassword: "different",
      acceptTerms: null,
    });
    expect(result.success).toBe(false);
    const fields = new Set(result.error?.issues.map((issue) => issue.path[0]));
    expect([...fields].sort()).toEqual(["acceptTerms", "displayName", "email", "password"]);

    const mismatch = signupSchema.safeParse({
      role: "mechanic",
      displayName: "Pat",
      email: "pat@example.test",
      password: PASSWORD,
      confirmPassword: `${PASSWORD}x`,
      acceptTerms: "on",
    });
    expect(mismatch.error?.issues.map((issue) => issue.path.join("."))).toEqual(["confirmPassword"]);
  });

  it("reports a duplicate email (any letter case) as a field error, not a crash", async () => {
    await signUp(t.ctx, signupInput());
    const error = await rejectionOf(signUp(t.ctx, signupInput({ email: "RILEY@example.test", role: "mechanic" })));
    expect(error.code).toBe("conflict");
    expect(isDuplicateEmailError(error)).toBe(true);
    expect(count("SELECT count(*) AS n FROM users")).toBe(1);
  });

  it("allows 5 sign-up attempts per IP address per hour", async () => {
    for (let index = 0; index < 5; index += 1) {
      await signUp(t.ctx, signupInput({ email: `person${index}@example.test` }));
    }
    const limited = await rejectionOf(signUp(t.ctx, signupInput({ email: "person5@example.test" })));
    expect(limited.code).toBe("rate_limited");
    expect(limited.userMessage).toBe("Too many sign-up attempts from this network. Try again in 60 minutes.");

    await signUp(t.ctx, signupInput({ email: "elsewhere@example.test", ip: "198.51.100.2" }));
    await signUp(withNow(t.ctx, addMinutes(t.ctx.now, 60)), signupInput({ email: "later@example.test" }));
    expect(count("SELECT count(*) AS n FROM users")).toBe(7);
  });
});

describe("roles", () => {
  it("cannot be changed once an account exists (database trigger)", async () => {
    const customer = await createUser(t.ctx, { role: "customer" });
    let caught: unknown;
    try {
      t.sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(customer.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("role_immutable");
    expect(mapDbError(caught)).toMatchObject({ code: "forbidden" });

    await expect(t.ctx.db.updateTable("users").set({ role: "mechanic" }).where("id", "=", customer.id).execute()).rejects.toThrow(
      "role_immutable",
    );
    expect(t.sqlite.prepare("SELECT role FROM users WHERE id = ?").get(customer.id)).toEqual({ role: "customer" });
  });
});

// ---------------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------------

describe("logIn", () => {
  it("logs in with the right password, ignoring email case and spaces", async () => {
    const dana = await userWithPassword("customer", "dana@example.test");
    const result = await logIn(t.ctx, { email: " DANA@example.test ", password: PASSWORD, ip: IP });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.viewer).toEqual({ id: dana.id, role: "customer", email: dana.email, displayName: dana.displayName });
    expect(await lookupSession(t.ctx, result.token)).toEqual(result.viewer);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    await userWithPassword("customer", "dana@example.test");
    expect(await logIn(t.ctx, { email: "dana@example.test", password: "wrong-password", ip: IP })).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await logIn(t.ctx, { email: "nobody@example.test", password: PASSWORD, ip: IP })).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(INVALID_CREDENTIALS_MESSAGE).toBe("Email or password is incorrect.");
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
  });

  it("tells a disabled account apart only when the password is right", async () => {
    const user = await userWithPassword("mechanic", "taylor@example.test");
    t.sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), user.id);
    expect(await logIn(t.ctx, { email: "taylor@example.test", password: "nope-nope-nope", ip: IP })).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await logIn(t.ctx, { email: "taylor@example.test", password: PASSWORD, ip: IP })).toEqual({
      ok: false,
      reason: "account_disabled",
    });
    expect(ACCOUNT_DISABLED_MESSAGE).toMatch(/disabled/);
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
  });

  it("locks an email for 15 minutes after 5 failures, even for the right password", async () => {
    await userWithPassword("customer", "dana@example.test");
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await logIn(t.ctx, { email: "dana@example.test", password: `guess-${attempt}`, ip: IP })).toMatchObject({
        reason: "invalid_credentials",
      });
    }
    expect(await logIn(t.ctx, { email: "dana@example.test", password: "guess-5", ip: IP })).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterMinutes: 15,
    });
    const tenMinutesLater = withNow(t.ctx, addMinutes(t.ctx.now, 10));
    expect(await logIn(tenMinutesLater, { email: "dana@example.test", password: PASSWORD, ip: "198.51.100.9" })).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterMinutes: 5,
    });
    const afterWindow = withNow(t.ctx, addMinutes(t.ctx.now, 15));
    expect((await logIn(afterWindow, { email: "dana@example.test", password: PASSWORD, ip: IP })).ok).toBe(true);
  });

  it("counts failures for unknown emails too, so lockouts reveal nothing", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await logIn(t.ctx, { email: "ghost@example.test", password: "whatever-1", ip: IP });
    }
    expect(await logIn(t.ctx, { email: "ghost@example.test", password: "whatever-1", ip: IP })).toMatchObject({
      reason: "rate_limited",
    });
  });

  it("limits one IP address to 20 failures per 15 minutes across all emails", async () => {
    await userWithPassword("customer", "dana@example.test");
    for (let attempt = 1; attempt <= 19; attempt += 1) {
      const result = await logIn(t.ctx, { email: `probe${attempt}@example.test`, password: "x-x-x-x-x", ip: IP });
      expect(result).toMatchObject({ reason: "invalid_credentials" });
    }
    expect(await logIn(t.ctx, { email: "probe20@example.test", password: "x-x-x-x-x", ip: IP })).toMatchObject({
      reason: "rate_limited",
    });
    expect(await logIn(t.ctx, { email: "dana@example.test", password: PASSWORD, ip: IP })).toMatchObject({
      reason: "rate_limited",
    });
    expect((await logIn(t.ctx, { email: "dana@example.test", password: PASSWORD, ip: "198.51.100.20" })).ok).toBe(true);
  });

  it("clears an email's failures after a successful login", async () => {
    await userWithPassword("customer", "dana@example.test");
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await logIn(t.ctx, { email: "dana@example.test", password: "wrong-again", ip: IP });
    }
    expect((await logIn(t.ctx, { email: "dana@example.test", password: PASSWORD, ip: IP })).ok).toBe(true);
    expect(await logIn(t.ctx, { email: "dana@example.test", password: "wrong-again", ip: IP })).toMatchObject({
      reason: "invalid_credentials",
    });
  });
});

describe("logInDemoAccount (one-click sample login)", () => {
  const DANA = "customer@example.com";
  const LOCAL_IP = "127.0.0.1";
  let samplePasswordHash: string;

  beforeAll(async () => {
    samplePasswordHash = await hashPassword(DEMO_PASSWORD);
  });

  /** A seeded-style sample account: listed email, is_demo_account = 1, the shared password. */
  function sampleUser(email: string, role: Viewer["role"] = "customer", displayName = "Dana"): Promise<Viewer> {
    return createUser(t.ctx, { role, email, displayName, passwordHash: samplePasswordHash, isDemoAccount: true });
  }

  const typed = (ctx: TestContext["ctx"], password: string, ip = LOCAL_IP) => logIn(ctx, { email: DANA, password, ip });

  it("signs in a listed sample account with the shared password and leaves the limits alone", async () => {
    const dana = await sampleUser(DANA);
    const result = await logInDemoAccount(t.ctx, { email: DANA });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.viewer).toEqual(dana);
    expect(await lookupSession(t.ctx, result.token)).toEqual(dana);
    expect(count("SELECT count(*) AS n FROM rate_limits")).toBe(0);
  });

  it("still signs in after typed failures lock the email, while typed logins stay locked", async () => {
    const dana = await sampleUser(DANA);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await typed(t.ctx, `guess-${attempt}`)).toMatchObject({ reason: "invalid_credentials" });
    }
    expect(await typed(t.ctx, "guess-5")).toMatchObject({ reason: "rate_limited", retryAfterMinutes: 15 });
    expect(await typed(t.ctx, DEMO_PASSWORD)).toMatchObject({ reason: "rate_limited" });

    const oneClick = await logInDemoAccount(t.ctx, { email: DANA });
    expect(oneClick.ok).toBe(true);
    if (!oneClick.ok) return;
    expect(await lookupSession(t.ctx, oneClick.token)).toEqual(dana);

    // The one-click success neither clears nor extends the lockout from typed attempts.
    const fiveMinutesLater = withNow(t.ctx, addMinutes(t.ctx.now, 5));
    expect(await typed(fiveMinutesLater, DEMO_PASSWORD)).toEqual({ ok: false, reason: "rate_limited", retryAfterMinutes: 10 });
    expect((await logInDemoAccount(fiveMinutesLater, { email: DANA })).ok).toBe(true);
    expect((await typed(withNow(t.ctx, addMinutes(t.ctx.now, 15)), DEMO_PASSWORD)).ok).toBe(true);
  });

  it("is not held back by the per-IP limit either", async () => {
    const dana = await sampleUser(DANA);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await logIn(t.ctx, { email: `probe${attempt}@example.test`, password: "x-x-x-x-x", ip: LOCAL_IP });
    }
    expect(await typed(t.ctx, DEMO_PASSWORD)).toMatchObject({ reason: "rate_limited" });

    const oneClick = await logInDemoAccount(t.ctx, { email: DANA });
    expect(oneClick).toMatchObject({ ok: true, viewer: dana });
    expect(await typed(t.ctx, DEMO_PASSWORD)).toMatchObject({ reason: "rate_limited" });
  });

  it("refuses anything but a listed sample account on the shared password, and counts nothing", async () => {
    // Same password and sample flag, but not on the one-click list (supporting cast).
    await sampleUser("nina@example.com", "customer", "Nina");
    // On the list, but a real account (is_demo_account = 0) that happens to use the address.
    await createUser(t.ctx, { role: "customer", email: "customer2@example.com", passwordHash: samplePasswordHash });
    // On the list and flagged, but its password is no longer the shared one.
    await createUser(t.ctx, {
      role: "mechanic",
      email: "mechanic@example.com",
      passwordHash: await hashPassword(PASSWORD),
      isDemoAccount: true,
    });

    // admin@example.com is listed but missing from this database.
    for (const email of ["nina@example.com", "customer2@example.com", "mechanic@example.com", "admin@example.com", ""]) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        expect(await logInDemoAccount(t.ctx, { email }), email).toEqual({ ok: false, reason: "invalid_credentials" });
      }
    }
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
    expect(count("SELECT count(*) AS n FROM rate_limits")).toBe(0);
    // None of those refusals locked the real account out of typed logins.
    expect((await logIn(t.ctx, { email: "customer2@example.com", password: DEMO_PASSWORD, ip: LOCAL_IP })).ok).toBe(true);
  });

  it("reports a disabled sample account and starts no session", async () => {
    const casey = await sampleUser("rejected@example.com", "mechanic", "Casey D.");
    t.sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), casey.id);
    expect(await logInDemoAccount(t.ctx, { email: "rejected@example.com" })).toEqual({
      ok: false,
      reason: "account_disabled",
    });
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
  });
});

// ---------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------

describe("sessions", () => {
  it("store only the SHA-256 digest of a 32-byte random token", async () => {
    const user = await createUser(t.ctx, { role: "customer" });
    const token = await createSession(t.ctx, user.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const row = t.sqlite.prepare("SELECT id, user_id, expires_at FROM sessions").get() as Record<string, string>;
    expect(row.id).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.id).toBe(hashSessionToken(token));
    expect(row.id).not.toContain(token);
    expect(row.expires_at).toBe(addDays(t.ctx.now, 7).toISOString());
  });

  it("are rejected once expired (7 days)", async () => {
    const user = await createUser(t.ctx, { role: "mechanic" });
    const token = await createSession(t.ctx, user.id);
    const expiry = addDays(t.ctx.now, 7);
    expect(await lookupSession(withNow(t.ctx, new Date(expiry.getTime() - 1)), token)).toMatchObject({ id: user.id });
    expect(await lookupSession(withNow(t.ctx, expiry), token)).toBeNull();

    expect(await deleteExpiredSessions(withNow(t.ctx, expiry))).toBe(1);
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
  });

  it("are rejected for disabled accounts and for unknown or malformed tokens", async () => {
    const user = await createUser(t.ctx, { role: "customer" });
    const token = await createSession(t.ctx, user.id);
    expect(await lookupSession(t.ctx, `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    for (const bad of ["", "short", `${token}x`, `${token.slice(0, -1)}!`, null, undefined]) {
      expect(await lookupSession(t.ctx, bad)).toBeNull();
    }
    t.sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(t.ctx.now.toISOString(), user.id);
    expect(await lookupSession(t.ctx, token)).toBeNull();
  });

  it("logout deletes the session row so the token stops working", async () => {
    const user = await createUser(t.ctx, { role: "admin" });
    const keep = await createSession(t.ctx, user.id);
    const token = await createSession(t.ctx, user.id);
    await deleteSession(t.ctx, token);
    expect(await lookupSession(t.ctx, token)).toBeNull();
    expect(count("SELECT count(*) AS n FROM sessions WHERE id = ?", hashSessionToken(token))).toBe(0);
    expect(await lookupSession(t.ctx, keep)).toMatchObject({ id: user.id, role: "admin" });
    await deleteSession(t.ctx, "not-a-token");
    await deleteSession(t.ctx, null);
  });

  it("use an httpOnly, SameSite=Lax cookie for 7 days (Secure only in production)", () => {
    expect(SESSION_COOKIE_NAME).toBe("wm_session");
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  });
});

// ---------------------------------------------------------------------------------
// Redirect targets
// ---------------------------------------------------------------------------------

describe("next-parameter sanitizing", () => {
  it("keeps same-site paths, including query and fragment", () => {
    expect(sanitizeNextPath("/requests/9b1d?tab=quotes#q1")).toBe("/requests/9b1d?tab=quotes#q1");
    expect(sanitizeNextPath("/")).toBe("/");
    expect(sanitizeNextPath("/mechanic/jobs/abc")).toBe("/mechanic/jobs/abc");
    expect(sanitizeNextPath("/a/../quotes")).toBe("/quotes");
    expect(sanitizeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example"); // still a local path
  });

  it("rejects anything that could leave the site or loop back to sign-in", () => {
    const unsafe: unknown[] = [
      "https://evil.example/",
      "http:evil.example",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      " /requests",
      "/.//evil.example",
      "/..//evil.example",
      "javascript:alert(1)",
      "requests/abc",
      "",
      `/${"a".repeat(600)}`,
      "/login",
      "/login?next=/quotes",
      "/signup?role=mechanic",
      null,
      undefined,
      42,
      ["/quotes"],
    ];
    for (const value of unsafe) expect(sanitizeNextPath(value), String(value)).toBeNull();
  });

  it("builds login, signup and access-denied links", () => {
    expect(loginPath("/requests/abc?x=1")).toBe("/login?next=%2Frequests%2Fabc%3Fx%3D1");
    expect(loginPath("https://evil.example")).toBe("/login");
    expect(loginPath(null)).toBe("/login");
    expect(signupPath({ role: "mechanic" })).toBe("/signup?role=mechanic");
    expect(signupPath({ next: "//evil.example" })).toBe("/signup");
    expect(accessDeniedPath(["mechanic"], "/mechanic/jobs")).toBe("/access-denied?need=mechanic&from=%2Fmechanic%2Fjobs");
    expect(accessDeniedPath(["customer", "admin"], "https://evil.example")).toBe("/access-denied?need=customer%2Cadmin");
    expect(parseRoleList("mechanic,admin,root")).toEqual(["mechanic", "admin"]);
    expect(parseRoleList(undefined)).toEqual([]);
  });

  it("sends each role to the right place after logging in", () => {
    expect(postLoginPath("customer", "/requests/abc")).toBe("/requests/abc");
    expect(postLoginPath("customer", null)).toBe("/account");
    expect(postLoginPath("customer", "https://evil.example")).toBe("/account");
    expect(postLoginPath("customer", "/mechanic/jobs")).toBe("/account");
    expect(postLoginPath("customer", "/admin")).toBe("/account");
    expect(postLoginPath("mechanic", null)).toBe("/mechanic/jobs");
    expect(postLoginPath("mechanic", "/mechanic/jobs/abc")).toBe("/mechanic/jobs/abc");
    expect(postLoginPath("mechanic", "/quotes")).toBe("/mechanic/jobs");
    expect(postLoginPath("mechanic", "/notifications")).toBe("/notifications");
    expect(postLoginPath("admin", null)).toBe("/admin");
    expect(postLoginPath("admin", "/admin/mechanics")).toBe("/admin/mechanics");
    expect(postLoginPath("admin", "/request")).toBe("/admin");
  });

  it("sends new customers on to their request and new mechanics to the application", () => {
    expect(postSignupPath("customer", null)).toBe("/request");
    expect(postSignupPath("customer", "/request")).toBe("/request");
    expect(postSignupPath("customer", "/help#demo")).toBe("/help#demo");
    expect(postSignupPath("customer", "//evil.example")).toBe("/request");
    expect(postSignupPath("mechanic", "/request")).toBe("/mechanic/apply");
  });
});
