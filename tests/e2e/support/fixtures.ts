import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Shared fixtures for the e2e specs:
// * every page (the default one and those from `newSession`) is watched for console errors
//   and uncaught page errors; any that a test did not expect fails the test at the end;
// * `newSession` opens an extra browser context (another person: a customer, a mechanic, an
//   admin), optionally with its own X-Forwarded-For address so sign-ups and failed logins
//   never share a per-IP rate-limit bucket.

/** Console errors that are never caused by the app under test. */
const ALWAYS_ALLOWED: readonly RegExp[] = [
  // Chrome's notice when a third-party map tile or font request is aborted by navigation.
  /net::ERR_ABORTED/,
];

export type ConsoleGuard = {
  /**
   * Accept console errors matching `pattern` for the rest of the test, e.g. the browser's own
   * "Failed to load resource: ... 404" line on an intentional not-found probe.
   */
  allow: (pattern: RegExp) => void;
  /** Watch another page (pages from `newSession` are watched automatically). */
  watch: (page: Page) => void;
  /** Problems seen so far (for debugging). */
  problems: () => readonly string[];
};

export type Session = { context: BrowserContext; page: Page; ip: string | null };

export type SessionOptions = {
  /** Give the context its own X-Forwarded-For address (sign-ups, failed logins). */
  uniqueIp?: boolean;
};

let ipCounter = 0;

/** A private 10.x.y.z address that is very unlikely to repeat between runs. */
export function uniqueIp(): string {
  ipCounter += 1;
  const seed = (Date.now() + ipCounter * 7919 + Math.floor(Math.random() * 1_000_000)) % 16_581_375;
  const a = 1 + (seed % 254);
  const b = 1 + (Math.floor(seed / 254) % 254);
  const c = 1 + (Math.floor(seed / 64_516) % 254);
  return `10.${a}.${b}.${c}`;
}

/** A short tag that makes names, emails and texts created by one test run unique. */
export function runTag(): string {
  return `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
}

const APP_ORIGIN = "http://localhost:3000";

/**
 * Sends `X-Forwarded-For: <ip>` with every request to the app. Same-origin only: as a
 * context-wide extraHTTPHeaders entry the header would also go to the map tile server, and a
 * non-safelisted header makes the browser send a CORS preflight that the tile server refuses.
 */
export async function forwardFor(context: BrowserContext, ip: string): Promise<void> {
  await context.route(
    (url) => url.origin === APP_ORIGIN,
    async (route) => route.continue({ headers: { ...(await route.request().allHeaders()), "x-forwarded-for": ip } }),
  );
}

/**
 * The app scrolls smoothly (html { scroll-behavior: smooth }). Playwright scrolls a target into
 * view before clicking it and then checks where it landed; a scroll that is still animating makes
 * long pages report "element is outside of the viewport". Tests therefore scroll instantly; this
 * changes nothing else about the page.
 */
const INSTANT_SCROLL = `(() => {
  const add = () => {
    if (!document.head || document.getElementById("e2e-instant-scroll")) return;
    const style = document.createElement("style");
    style.id = "e2e-instant-scroll";
    style.textContent = "html, body { scroll-behavior: auto !important; }";
    document.head.appendChild(style);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add, { once: true });
  else add();
})();`;

async function openSession(browser: Browser, options: SessionOptions, viewport: { width: number; height: number } | null): Promise<Session> {
  const ip = options.uniqueIp ? uniqueIp() : null;
  const context = await browser.newContext({
    baseURL: APP_ORIGIN,
    viewport: viewport ?? { width: 1280, height: 800 },
  });
  await context.addInitScript(INSTANT_SCROLL);
  if (ip) await forwardFor(context, ip);
  const page = await context.newPage();
  return { context, page, ip };
}

type Fixtures = {
  consoleGuard: ConsoleGuard;
  newSession: (options?: SessionOptions) => Promise<Session>;
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, provide) => {
    await context.addInitScript(INSTANT_SCROLL);
    await provide(context);
  },

  consoleGuard: [
    async ({ page }, provide, testInfo) => {
      const allowed: RegExp[] = [...ALWAYS_ALLOWED];
      const problems: string[] = [];
      const watched = new WeakSet<Page>();
      const watch = (target: Page) => {
        if (watched.has(target)) return;
        watched.add(target);
        target.on("console", (message) => {
          if (message.type() !== "error") return;
          const where = message.location().url;
          const text = `${message.text()}${where ? ` (${where})` : ""}`;
          if (allowed.some((pattern) => pattern.test(text))) return;
          problems.push(`console.error on ${target.url()}: ${text}`);
        });
        target.on("pageerror", (error) => {
          const text = `${error.name}: ${error.message}`;
          if (allowed.some((pattern) => pattern.test(text))) return;
          problems.push(`page error on ${target.url()}: ${text}`);
        });
      };
      watch(page);
      await provide({ allow: (pattern) => allowed.push(pattern), watch, problems: () => problems });
      if (problems.length > 0) {
        await testInfo.attach("console-errors.txt", { body: problems.join("\n"), contentType: "text/plain" });
      }
      expect(problems, "unexpected console errors or page errors").toEqual([]);
    },
    { auto: true },
  ],

  newSession: async ({ browser, consoleGuard, viewport }, provide) => {
    const sessions: Session[] = [];
    await provide(async (options = {}) => {
      const session = await openSession(browser, options, viewport);
      consoleGuard.watch(session.page);
      sessions.push(session);
      return session;
    });
    for (const session of sessions) await session.context.close().catch(() => undefined);
  },
});

export { expect };
