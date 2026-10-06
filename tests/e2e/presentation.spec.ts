import type { Page } from "@playwright/test";

import { oneClickLogin, SAMPLE_PASSWORD, submitSignupForm, testEmail, type SampleKey } from "./support/auth";
import { dbGet, userIdByEmail } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";

// Presentation mode (ARCHITECTURE section 11): no "demo" wording anywhere people can read it.
// Every page is opened, its closed disclosures, hidden tab panels and later wizard steps are
// revealed, and the text (including screen-reader-only text, the page title and labelling
// attributes) is searched for the word.

const DEMO = /\bdemo\b/i;

/**
 * Opens `path` and returns every place its text says "demo". The shared sample-account
 * password ("repair-pilot-2026", shown in the login page's "Use the form instead" disclosure) is
 * left out by default and checked by its own test below, so the crawl reports everything else.
 */
async function demoWordingOn(page: Page, path: string, ignore: readonly string[] = [SAMPLE_PASSWORD]): Promise<string[]> {
  await page.goto(path);
  await expect(page.locator("main").first()).toBeVisible();
  // Let streamed sections (Suspense, loading.tsx) and client islands settle.
  await page.waitForLoadState("load");
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  // Read-only: the page is never modified (changing attributes before React hydrates would
  // itself cause hydration errors).
  const found = await page.evaluate(({ source, skip }) => {
    const pattern = new RegExp(source, "i");
    const clean = (value: string) => skip.reduce((text, literal) => text.split(literal).join(" "), value);
    const hits: string[] = [];
    const scan = (text: string) => {
      for (const line of text.split("\n")) {
        const match = pattern.exec(clean(line));
        if (!match) continue;
        const start = Math.max(0, match.index - 90);
        hits.push(line.trim().length <= 200 ? line.trim() : `…${line.slice(start, start + 200).trim()}…`);
      }
    };
    if (pattern.test(clean(document.title))) hits.push(`<title>: ${document.title}`);
    scan(document.body.innerText);
    // Text people reach with one more step: closed disclosures, other tabs and the later steps
    // of form wizards. That content isn't rendered (Chrome keeps closed <details> content
    // unrendered), so its text nodes are read one by one instead of innerText.
    const later = document.querySelectorAll<HTMLElement>(
      'details:not([open]) > :not(summary), [role="tabpanel"][hidden], form section[hidden]',
    );
    later.forEach((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) scan(node.nodeValue ?? "");
    });
    document.querySelectorAll("[aria-label], [title], [alt], [placeholder]").forEach((element) => {
      for (const attribute of ["aria-label", "title", "alt", "placeholder"]) {
        const value = element.getAttribute(attribute);
        if (value && pattern.test(clean(value))) hits.push(`[${attribute}] ${value.slice(0, 200)}`);
      }
    });
    return hits;
  }, { source: DEMO.source, skip: [...ignore] });
  return found.map((hit) => `${path} -> ${hit}`);
}

async function crawl(page: Page, paths: readonly string[]): Promise<void> {
  const hits: string[] = [];
  for (const path of paths) hits.push(...(await demoWordingOn(page, path)));
  expect(hits, "no 'demo' wording on any page").toEqual([]);
}

async function crawlAs(page: Page, who: SampleKey, paths: readonly string[]): Promise<void> {
  await oneClickLogin(page, who);
  await crawl(page, paths);
}

function firstId(sql: string, ...params: string[]): string {
  const row = dbGet<{ id: string }>(sql, ...params);
  if (!row) throw new Error(`No row for: ${sql}`);
  return row.id;
}

test("signed-out pages", async ({ page, consoleGuard }) => {
  test.setTimeout(600_000);
  consoleGuard.allow(/status of 404/);
  await crawl(page, ["/", "/help", "/login", "/signup", "/signup?role=mechanic", "/request", "/access-denied?need=admin", "/no-such-page"]);
});

test("customer pages (Dana)", async ({ page, consoleGuard }) => {
  test.setTimeout(600_000);
  consoleGuard.allow(/status of 404/);
  const danaId = userIdByEmail("customer@example.com");
  const requestId = firstId("SELECT id FROM repair_requests WHERE customer_id = ? AND status IN ('open', 'quoted') ORDER BY submitted_at LIMIT 1", danaId);
  const pendingId = firstId("SELECT id FROM bookings WHERE customer_id = ? ORDER BY CASE status WHEN 'pending_payment' THEN 0 ELSE 1 END LIMIT 1", danaId);
  const quote = dbGet<{ id: string; request_id: string }>(
    `SELECT q.id, q.request_id FROM quotes q JOIN repair_requests r ON r.id = q.request_id
      WHERE r.customer_id = ? AND r.status IN ('open', 'quoted')
      ORDER BY CASE WHEN q.status = 'submitted' AND q.expires_at > ? THEN 0 ELSE 1 END, q.created_at DESC LIMIT 1`,
    danaId,
    new Date().toISOString(),
  );
  const completedId = firstId("SELECT id FROM bookings WHERE customer_id = ? AND status = 'completed' ORDER BY created_at LIMIT 1", danaId);
  const confirmedId = firstId(
    "SELECT id FROM bookings WHERE customer_id = ? AND status IN ('confirmed', 'in_progress', 'completed') ORDER BY slot_start_at DESC LIMIT 1",
    danaId,
  );
  await crawlAs(page, "dana", [
    "/",
    "/account",
    "/account/photo",
    "/request",
    "/quotes",
    `/requests/${requestId}`,
    ...(quote ? [`/requests/${quote.request_id}/select/${quote.id}`] : []),
    "/bookings",
    `/bookings/${pendingId}`,
    `/bookings/${completedId}`,
    `/bookings/${confirmedId}`,
    "/support",
    "/notifications",
    "/help",
  ]);
});

test("mechanic pages (Marco)", async ({ page }) => {
  test.setTimeout(600_000);
  const marcoId = userIdByEmail("mechanic@example.com");
  const jobId = firstId(
    `SELECT jm.request_id AS id FROM job_matches jm JOIN repair_requests r ON r.id = jm.request_id
      WHERE jm.mechanic_id = ? AND r.status IN ('open', 'quoted') ORDER BY r.submitted_at LIMIT 1`,
    marcoId,
  );
  const bookingId = firstId("SELECT id FROM bookings WHERE mechanic_id = ? AND status = 'completed' ORDER BY created_at LIMIT 1", marcoId);
  const reservationId = firstId("SELECT id FROM bookings WHERE mechanic_id = ? ORDER BY CASE status WHEN 'pending_payment' THEN 0 ELSE 1 END LIMIT 1", marcoId);
  await crawlAs(page, "marco", [
    "/mechanic/jobs",
    "/mechanic/jobs?tab=interested",
    "/mechanic/jobs?tab=quotes",
    "/mechanic/jobs?tab=bookings",
    `/mechanic/jobs/${jobId}`,
    `/mechanic/bookings/${bookingId}`,
    `/mechanic/bookings/${reservationId}`,
    "/mechanic/profile",
    "/mechanic/gallery",
    "/support",
    "/notifications",
  ]);
});

test("mechanics in other account states (applied, suspended, expired insurance, rejected)", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  await crawlAs(page, "alex", ["/mechanic/jobs", "/mechanic/profile"]);
  for (const who of ["taylor", "morgan", "casey"] as const) {
    const session = await newSession();
    await crawlAs(session.page, who, ["/mechanic/jobs", "/mechanic/profile"]);
  }
});

test("admin pages (Avery)", async ({ page }) => {
  test.setTimeout(600_000);
  const alexId = userIdByEmail("applicant@example.com");
  const marcoId = userIdByEmail("mechanic@example.com");
  const requestId = firstId("SELECT id FROM repair_requests WHERE matched_count = 0 AND status <> 'draft' ORDER BY submitted_at LIMIT 1");
  const bookedRequestId = firstId("SELECT request_id AS id FROM bookings WHERE status = 'completed' ORDER BY created_at LIMIT 1");
  const mailId = firstId("SELECT id FROM email_outbox ORDER BY created_at DESC LIMIT 1");
  await crawlAs(page, "avery", [
    "/admin",
    "/admin/mechanics",
    `/admin/mechanics/${alexId}`,
    `/admin/mechanics/${marcoId}`,
    "/admin/requests",
    `/admin/requests/${requestId}`,
    `/admin/requests/${bookedRequestId}`,
    "/admin/matching",
    "/admin/marketplace",
    "/admin/marketplace?tab=bookings",
    "/admin/marketplace?tab=reviews",
    "/admin/settings",
    "/admin/support",
    "/admin/audit",
    "/admin/mailbox",
    `/admin/mailbox/${mailId}`,
    "/notifications",
  ]);
});

test("the login page's sample-account password shows no 'demo' wording", async ({ page }) => {
  test.slow();
  expect(await demoWordingOn(page, "/login", [])).toEqual([]);
});

test("form messages people can trigger say nothing about a demo", async ({ newSession }) => {
  test.setTimeout(600_000);
  const { page } = await newSession({ uniqueIp: true });
  const tag = runTag();
  await submitSignupForm(page, {
    role: "customer",
    displayName: `Terms ${tag}`,
    email: testEmail("e2e.terms", tag),
    password: "a-strong-password-1",
    acceptTerms: false,
  });
  const termsError = page.locator("#field-acceptTerms-error, [id^='field-acceptTerms'][id$='-error']").first();
  await expect(termsError).toBeVisible();
  const messages = await page.locator('[role="alert"], [id$="-error"]').allInnerTexts();
  expect(messages.join("\n")).not.toMatch(DEMO);
});

test("honesty: seeded reviews never make a rating, and the admin outbox says nothing was sent", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  // Sam's Garage has only a seeded 5-star review from Dana: customers still see "New".
  const danaId = userIdByEmail("customer@example.com");
  const samId = userIdByEmail("garage@example.com");
  const quoted = dbGet<{ request_id: string }>(
    "SELECT q.request_id FROM quotes q JOIN repair_requests r ON r.id = q.request_id WHERE q.mechanic_id = ? AND r.customer_id = ? LIMIT 1",
    samId,
    danaId,
  );
  expect(quoted, "Dana has a quote from Sam's Garage in the sample data").toBeTruthy();
  expect(dbGet<{ n: number }>("SELECT count(*) AS n FROM reviews WHERE mechanic_id = ? AND is_demo_fixture = 0", samId)?.n).toBe(0);
  await oneClickLogin(page, "dana");
  await page.goto(`/requests/${quoted?.request_id}`);
  const samCard = page
    .locator("article, li, section, div")
    .filter({ has: page.getByRole("heading", { name: "Quote from Sam's Garage" }) })
    .last();
  await expect(samCard).toBeVisible();
  await expect(samCard.getByText("New", { exact: true }).first()).toBeVisible();
  await expect(samCard.getByText("No reviews from completed jobs yet").first()).toBeVisible();
  // Dana sees her own seeded review only with a "not counted" label.
  const reviews = samCard.locator("details").filter({ hasText: /Recent reviews/ }).first();
  if (await reviews.count()) {
    await reviews.locator("summary").click();
    const items = reviews.getByRole("listitem");
    const total = await items.count();
    for (let index = 0; index < total; index += 1) {
      await expect(items.nth(index)).toContainText("not counted in the rating");
    }
  }

  const admin = await newSession();
  await oneClickLogin(admin.page, "avery");
  await admin.page.goto("/admin/mailbox");
  await expect(admin.page.getByText(/Local capture\s*·\s*not sent/).first()).toBeVisible();
  await admin.page.getByRole("list", { name: "Captured emails, newest first" }).getByRole("link").first().click();
  await expect(admin.page.getByText(/this message was never delivered/)).toBeVisible();
});
