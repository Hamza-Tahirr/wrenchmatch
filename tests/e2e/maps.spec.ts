import type { Locator, Page } from "@playwright/test";

import { oneClickLogin } from "./support/auth";
import { dbGet, userIdByEmail } from "./support/db";
import { expect, test } from "./support/fixtures";

// Maps load MapLibre lazily and draw approximate ZIP-centre points only. Each one needs a
// rendered canvas plus a text alternative that lists the same places.

/** The map widget (role=group named by its label) and its MapLibre canvas, scrolled into view. */
async function expectMapCanvas(page: Page, label: RegExp): Promise<Locator> {
  const map = page.getByRole("group", { name: label }).first();
  await map.scrollIntoViewIfNeeded();
  await expect(map).toBeVisible();
  const canvas = map.locator("canvas.maplibregl-canvas");
  await expect(canvas, "the map should draw with WebGL").toBeVisible({ timeout: 60_000 });
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  await expect(page.getByText("Map unavailable")).toHaveCount(0);
  return map;
}

/** Opens the "List view" disclosure under a map and returns the listed items. */
async function openListView(map: Locator): Promise<Locator> {
  const wrapper = map.locator("xpath=..");
  const toggle = wrapper.getByRole("button", { name: /list view/i });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = wrapper.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  await expect(list).toBeVisible();
  return list.getByRole("listitem");
}

test("the customer's request page maps the request area and the quoting mechanics, with a list view", async ({ page }) => {
  test.slow();
  const danaId = userIdByEmail("customer@example.com");
  const withQuotes = dbGet<{ id: string }>(
    `SELECT r.id FROM repair_requests r WHERE r.customer_id = ?
       AND (SELECT count(DISTINCT q.mechanic_id) FROM quotes q WHERE q.request_id = r.id) >= 2
     ORDER BY r.submitted_at LIMIT 1`,
    danaId,
  );
  expect(withQuotes, "Dana needs a request with quotes from two mechanics").toBeTruthy();
  await oneClickLogin(page, "dana");
  await page.goto(`/requests/${withQuotes?.id}`);
  const map = await expectMapCanvas(page, /^Your request's approximate area/);
  const items = await openListView(map);
  await expect(items.filter({ hasText: "Your request" }).first()).toBeVisible();
  await expect(items.filter({ hasText: "Marco R." }).first()).toBeVisible();
  expect(await items.count()).toBeGreaterThanOrEqual(3);
  await expect(items.filter({ hasText: /approximate/i }).first()).toBeVisible();
});

test("the mechanic job board maps matched jobs next to the job list", async ({ page }) => {
  test.slow();
  await oneClickLogin(page, "marco");
  await page.goto("/mechanic/jobs");
  const map = page.getByRole("group").filter({ has: page.locator("canvas.maplibregl-canvas, .wm-marker") }).first();
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 60_000 });
  await expect(map).toBeVisible();
  // The text alternative is the job list itself: every job on the map has a card with its area.
  const jobLinks = page.getByRole("link", { name: /^View job: / });
  await expect(jobLinks.first()).toBeVisible();
  expect(await jobLinks.count()).toBeGreaterThan(0);
  const markers = map.locator(".wm-marker");
  await expect(markers.first()).toBeAttached();
  await expect(page.getByText("Map unavailable")).toHaveCount(0);
});

test("the admin matching page maps requests needing follow-up, with a list view", async ({ page }) => {
  test.slow();
  await oneClickLogin(page, "avery");
  await page.goto("/admin/matching");
  const map = await expectMapCanvas(page, /^Matching diagnostics map/);
  const items = await openListView(map);
  expect(await items.count()).toBeGreaterThan(0);
  await expect(items.filter({ hasText: /Maricopa|85138/ }).first()).toBeVisible();
});
