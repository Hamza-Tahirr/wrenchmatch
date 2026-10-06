// The login Server Actions against a test database, with the Next.js request APIs stubbed:
// a lockout from failed typed logins never blocks the one-click sample login (which still
// needs DEMO_MODE and a request to localhost), and the typed login stays locked.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { demoLoginAction, loginAction } from "@/app/(public)/login/actions";
import { DEMO_PASSWORD } from "@/server/auth/demo-accounts";
import { hashPassword } from "@/server/auth/password";
import { rateLimitMessage } from "@/server/auth/rate-limit";
import { lookupSession, SESSION_COOKIE_NAME } from "@/server/auth/session";
import type { AppContext, Viewer } from "@/server/context";
import { createTestContext, type TestContext } from "../support/db";
import { createUser } from "../support/factories";

const stub = vi.hoisted(() => {
  /** What the stubbed redirect() throws, like Next.js does. */
  class RedirectSignal extends Error {
    readonly location: string;
    constructor(location: string) {
      super(`NEXT_REDIRECT ${location}`);
      this.location = location;
    }
  }
  return {
    RedirectSignal,
    ctx: undefined as AppContext | undefined,
    demoMode: true,
    headers: {} as Record<string, string>,
    cookies: new Map<string, string>(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new stub.RedirectSignal(location);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(stub.headers),
  cookies: async () => ({
    get: (name: string) => {
      const value = stub.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) stub.cookies.delete(name);
      else stub.cookies.set(name, value);
    },
  }),
}));

vi.mock("@/server/context", () => ({
  createAppContext: () => {
    if (!stub.ctx) throw new Error("no test context");
    return stub.ctx;
  },
}));

vi.mock("@/server/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/config")>()),
  get DEMO_MODE() {
    return stub.demoMode;
  },
}));

const DANA = "customer@example.com";
const LOCKED = rateLimitMessage("login_email", 15);

let t: TestContext;
let samplePasswordHash: string;

beforeAll(async () => {
  samplePasswordHash = await hashPassword(DEMO_PASSWORD);
});

beforeEach(() => {
  t = createTestContext();
  stub.ctx = t.ctx;
  stub.demoMode = true;
  stub.headers = { host: "localhost:3000", "x-forwarded-for": "127.0.0.1" };
  stub.cookies.clear();
});

afterEach(async () => {
  stub.ctx = undefined;
  await t.cleanup();
});

const count = (sql: string) => (t.sqlite.prepare(sql).get() as { n: number }).n;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** Where an action redirected to (it must redirect). */
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof stub.RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

const typedLogin = (password: string) => loginAction({ ok: false }, form({ email: DANA, password }));
const oneClickLogin = (fields: Record<string, string> = {}) => demoLoginAction(form({ email: DANA, ...fields }));

function createDana(): Promise<Viewer> {
  return createUser(t.ctx, {
    role: "customer",
    email: DANA,
    displayName: "Dana",
    passwordHash: samplePasswordHash,
    isDemoAccount: true,
  });
}

describe("one-click sample login vs. failed-login limits", () => {
  it("signs in after typed failures lock the account, and the typed login stays locked", async () => {
    const dana = await createDana();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await typedLogin(`wrong-guess-${attempt}`)).toMatchObject({ formError: "Email or password is incorrect." });
    }
    expect(await typedLogin("wrong-guess-5")).toMatchObject({ formError: LOCKED });
    expect(await typedLogin(DEMO_PASSWORD)).toMatchObject({ formError: LOCKED });

    expect(await redirectOf(oneClickLogin())).toBe("/account");
    expect(await lookupSession(t.ctx, stub.cookies.get(SESSION_COOKIE_NAME))).toEqual(dana);

    expect(await typedLogin(DEMO_PASSWORD)).toMatchObject({ formError: LOCKED });
  });

  it("signs in after this address used up its failed-login allowance", async () => {
    const dana = await createDana();
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await loginAction({ ok: false }, form({ email: `probe${attempt}@example.test`, password: "x-x-x-x-x" }));
    }
    expect(await typedLogin(DEMO_PASSWORD)).toMatchObject({ formError: LOCKED });

    expect(await redirectOf(oneClickLogin({ next: "/requests/abc" }))).toBe("/requests/abc");
    expect(await lookupSession(t.ctx, stub.cookies.get(SESSION_COOKIE_NAME))).toEqual(dana);
  });
});

describe("one-click sample login gates (unchanged)", () => {
  it("works only for requests to localhost", async () => {
    await createDana();
    for (const host of ["192.168.1.20:3000", "wrenchmatch.example", "localhost.example.com", ""]) {
      stub.headers = { host, "x-forwarded-for": "127.0.0.1" };
      expect(await redirectOf(oneClickLogin()), host).toBe("/login");
    }
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);

    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      stub.headers = { host };
      stub.cookies.clear();
      expect(await redirectOf(oneClickLogin()), host).toBe("/account");
      expect(stub.cookies.has(SESSION_COOKIE_NAME)).toBe(true);
    }
  });

  it("does nothing with DEMO_MODE off or for an email outside the list", async () => {
    await createDana();
    await createUser(t.ctx, { role: "customer", email: "nina@example.com", passwordHash: samplePasswordHash, isDemoAccount: true });
    stub.demoMode = false;
    expect(await redirectOf(oneClickLogin())).toBe("/login");
    stub.demoMode = true;
    expect(await redirectOf(oneClickLogin({ email: "nina@example.com", next: "/quotes" }))).toBe("/login?next=%2Fquotes");
    expect(count("SELECT count(*) AS n FROM sessions")).toBe(0);
    expect(stub.cookies.size).toBe(0);
  });

  it("reports a listed account missing from the database, counting nothing", async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(await redirectOf(oneClickLogin({ email: "admin@example.com" }))).toBe("/login?sample_error=invalid_credentials");
    }
    expect(count("SELECT count(*) AS n FROM rate_limits")).toBe(0);
  });
});
