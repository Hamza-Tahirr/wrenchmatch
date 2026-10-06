import type { Page } from "@playwright/test";

import { expectPath, oneClickLogin, type SampleKey } from "./support/auth";
import { dbGet, userIdByEmail } from "./support/db";
import { expect, test } from "./support/fixtures";

// Runs in both projects: "mobile" (390 x 844, the main target) and "desktop" (1280 x 800).
// Pages must never scroll sideways; on phones the Menu button opens the navigation panel.

type Overflow = { scrollX: number; scrollWidth: number; viewport: number; offenders: string[] };

async function horizontalOverflow(page: Page, path: string): Promise<Overflow> {
  await page.goto(path);
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    window.scrollTo({ left: 10_000, top: window.scrollY, behavior: "instant" });
    const scrollX = window.scrollX;
    window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
    const offenders: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= viewport + 1) continue;
      // Only report elements whose own box sticks out, not the ancestors that contain them.
      const style = getComputedStyle(element);
      if (style.position === "fixed" || style.visibility === "hidden") continue;
      let clipped = false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX !== "visible") {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const name = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${String(element.className).split(" ").slice(0, 3).join(".")}`;
      offenders.push(`${name} (right edge ${Math.round(rect.right)}px)`);
      if (offenders.length >= 5) break;
    }
    return { scrollX, scrollWidth: document.documentElement.scrollWidth, viewport, offenders };
  });
}

async function expectNoSidewaysScroll(page: Page, paths: readonly string[]): Promise<void> {
  const problems: string[] = [];
  for (const path of paths) {
    const result = await horizontalOverflow(page, path);
    if (result.scrollX > 0) {
      problems.push(
        `${path}: page scrolls sideways (scrollWidth ${result.scrollWidth}px > viewport ${result.viewport}px, scrollX ${result.scrollX}); ${result.offenders.join(", ") || "no single offender found"}`,
      );
    }
  }
  expect(problems, "pages without horizontal overflow").toEqual([]);
}

function idOf(sql: string, ...params: string[]): string {
  const row = dbGet<{ id: string }>(sql, ...params);
  if (!row) throw new Error(`No row for: ${sql}`);
  return row.id;
}

const SIGNED_OUT_PAGES = ["/", "/help", "/login", "/signup", "/request"];

test.describe("no horizontal overflow", () => {
  test("signed out", async ({ page }) => {
    test.setTimeout(600_000);
    await expectNoSidewaysScroll(page, SIGNED_OUT_PAGES);
  });

  test("customer", async ({ page }) => {
    test.setTimeout(600_000);
    const danaId = userIdByEmail("customer@example.com");
    const requestId = idOf("SELECT id FROM repair_requests WHERE customer_id = ? AND status IN ('open', 'quoted') ORDER BY submitted_at LIMIT 1", danaId);
    const bookingId = idOf("SELECT id FROM bookings WHERE customer_id = ? AND status = 'completed' ORDER BY created_at LIMIT 1", danaId);
    await oneClickLogin(page, "dana");
    await expectNoSidewaysScroll(page, ["/account", "/request", "/quotes", `/requests/${requestId}`, "/bookings", `/bookings/${bookingId}`, "/support"]);
  });

  test("mechanic", async ({ page }) => {
    test.setTimeout(600_000);
    const marcoId = userIdByEmail("mechanic@example.com");
    const jobId = idOf(
      `SELECT jm.request_id AS id FROM job_matches jm JOIN repair_requests r ON r.id = jm.request_id
        WHERE jm.mechanic_id = ? AND r.status IN ('open', 'quoted') ORDER BY r.submitted_at LIMIT 1`,
      marcoId,
    );
    const bookingId = idOf("SELECT id FROM bookings WHERE mechanic_id = ? AND status = 'completed' ORDER BY created_at LIMIT 1", marcoId);
    await oneClickLogin(page, "marco");
    await expectNoSidewaysScroll(page, ["/mechanic/jobs", `/mechanic/jobs/${jobId}`, `/mechanic/bookings/${bookingId}`, "/mechanic/profile", "/mechanic/gallery"]);
  });

  test("admin", async ({ page }) => {
    test.setTimeout(600_000);
    await oneClickLogin(page, "avery");
    await expectNoSidewaysScroll(page, ["/admin", "/admin/mechanics", "/admin/requests", "/admin/matching", "/admin/marketplace", "/admin/support", "/admin/audit"]);
  });
});

const MENU_CASES: ReadonlyArray<{ who: SampleKey | null; start: string; link: string; target: string }> = [
  { who: null, start: "/help", link: "Log in", target: "/login" },
  { who: "dana", start: "/account", link: "Quotes", target: "/quotes" },
  { who: "marco", start: "/mechanic/jobs", link: "Profile", target: "/mechanic/profile" },
  { who: "avery", start: "/admin/mechanics", link: "Dashboard", target: "/admin" },
];

test.describe("mobile menu", () => {
  for (const item of MENU_CASES) {
    test(`opens and navigates (${item.who ?? "signed out"})`, async ({ page, viewport }) => {
      test.skip((viewport?.width ?? 0) >= 1024, "The Menu button is only shown below the lg breakpoint (mobile project).");
      test.setTimeout(600_000);
      if (item.who) await oneClickLogin(page, item.who);
      await page.goto(item.start);
      const button = page.getByRole("button", { name: "Menu" });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      const panel = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
      await expect(panel).toBeVisible();
      await panel.getByRole("link", { name: item.link, exact: true }).first().click();
      await expectPath(page, item.target);
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeHidden();
      // Escape closes it too.
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    });
  }
});
