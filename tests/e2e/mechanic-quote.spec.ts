import type { Page } from "@playwright/test";

import { expectPath, oneClickLogin } from "./support/auth";
import { addDays, freeSlot, nextWeekday } from "./support/dates";
import { dbGet, dbValue, userIdByEmail } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";
import { fillQuoteForm, openJobFromBoard, quoteForm, sendQuote, submitRequest } from "./support/flows";

/** A job Marco is matched to (other than `excludeId`) that is open and has no active quote from him. */
function otherQuotableJobForMarco(marcoId: string, excludeId: string): string | undefined {
  return dbGet<{ id: string }>(
    `SELECT r.id FROM job_matches jm
       JOIN repair_requests r ON r.id = jm.request_id
       JOIN service_categories c ON c.id = r.category_id
      WHERE jm.mechanic_id = ? AND jm.status <> 'passed' AND r.id <> ?
        AND r.status IN ('open', 'quoted') AND r.expires_at > ?
        AND r.service_mode IN ('mobile', 'either') AND c.id <> 'suspension_work'
        AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = r.id AND q.mechanic_id = jm.mechanic_id
                          AND q.status IN ('submitted', 'selected'))
      ORDER BY r.submitted_at DESC LIMIT 1`,
    marcoId,
    excludeId,
    new Date().toISOString(),
  )?.id;
}

/** The price breakdown table of one mechanic's quote on the customer's request page. */
function breakdown(page: Page, mechanicName: string) {
  return page.getByRole("table", { name: `Price breakdown of ${mechanicName}'s quote` }).first();
}

test("Marco quotes Dana's new job (labor, part, tax); Dana sees each line and the total; overlapping slots are refused; Marco withdraws", async ({
  page,
  newSession,
}) => {
  // Several people and many page loads on a dev server that recompiles while others edit code.
  test.setTimeout(900_000);
  const tag = runTag();
  const model = `Corolla ${tag}`;
  const preferredDate = nextWeekday(4);
  const marcoId = userIdByEmail("mechanic@example.com");

  // Dana sends a new request that Marco is matched to.
  await oneClickLogin(page, "dana");
  const requestId = await submitRequest(page, {
    zip: "85281",
    year: "2018",
    make: "Toyota",
    model,
    mileage: "72000",
    categoryId: "oil_change",
    description: `Oil and filter change with full synthetic, please. Ref ${tag}.`,
    drivable: "yes",
    preferredDate,
    window: "morning",
    serviceMode: "mobile",
    phone: "602-555-0148",
  });
  expect(dbValue("SELECT count(*) FROM job_matches WHERE request_id = ? AND mechanic_id = ?", requestId, marcoId)).toBe(1);

  // Marco finds it on his job board, marks himself interested and sends an itemized quote.
  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await openJobFromBoard(marco.page, `2018 Toyota ${model}`);
  await expectPath(marco.page, `/mechanic/jobs/${requestId}`);
  await marco.page.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(marco.page.getByText(/You.re interested/).first()).toBeVisible();
  expect(dbGet<{ status: string }>("SELECT status FROM job_matches WHERE request_id = ? AND mechanic_id = ?", requestId, marcoId)?.status).toBe(
    "interested",
  );

  const slot = freeSlot(marcoId, [preferredDate, addDays(preferredDate, 1), addDays(preferredDate, 3)], 60);
  const partName = `Full synthetic 0W-20 oil and filter ${tag}`;
  await sendQuote(marco.page, {
    labor: "120.00",
    parts: [{ description: partName, quantity: "1", unitPrice: "38.50" }],
    taxes: [{ description: "Sales tax on parts", amount: "3.31" }],
    earliestStart: slot,
    durationMinutes: "60",
    serviceMode: "mobile",
    scope: "Drain and refill the engine oil, replace the oil filter and check all fluid levels.",
    validityHours: "48",
  });
  const quote = dbGet<{ id: string; labor_cents: number; parts_cents: number; tax_cents: number; fee_cents: number; total_cents: number; status: string }>(
    "SELECT id, labor_cents, parts_cents, tax_cents, fee_cents, total_cents, status FROM quotes WHERE request_id = ? AND mechanic_id = ?",
    requestId,
    marcoId,
  );
  expect(quote).toMatchObject({ labor_cents: 12000, parts_cents: 3850, tax_cents: 331, fee_cents: 0, total_cents: 16181, status: "submitted" });

  // Dana sees the quote with each line and the server-computed total.
  await page.goto(`/requests/${requestId}`);
  const table = breakdown(page, "Marco R.");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row", { name: /^Labor\s*\$120\.00$/ })).toBeVisible();
  await expect(table.getByRole("row", { name: new RegExp(`${partName}.*\\$38\\.50`) })).toBeVisible();
  await expect(table.getByRole("row", { name: /^Sales tax on parts\s*\$3\.31$/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /^Total\s*\$161\.81/ })).toBeVisible();
  await expect(table.getByText(/platform fee of \$12\.00 \(10% of labor\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Select Marco R.'s quote" }).first()).toBeVisible();

  // A second quote over the same time slot is refused (the first quote holds it).
  const otherJob = otherQuotableJobForMarco(marcoId, requestId);
  expect(otherJob, "Marco needs another open matched job to test the slot conflict").toBeTruthy();
  const quotesBefore = dbValue("SELECT count(*) FROM quotes WHERE mechanic_id = ?", marcoId);
  await marco.page.goto(`/mechanic/jobs/${otherJob}`);
  await fillQuoteForm(marco.page, {
    labor: "95.00",
    earliestStart: slot,
    durationMinutes: "60",
    serviceMode: "mobile",
    scope: "Inspect the problem and explain the options.",
  });
  await quoteForm(marco.page).getByRole("button", { name: "Send quote" }).click();
  await expect(marco.page.getByText("That time overlaps another commitment").first()).toBeVisible({ timeout: 60_000 });
  expect(dbValue("SELECT count(*) FROM quotes WHERE mechanic_id = ?", marcoId)).toBe(quotesBefore);

  // Marco withdraws his quote: the slot is released and Dana can no longer select it.
  await marco.page.goto(`/mechanic/jobs/${requestId}`);
  await marco.page.getByRole("button", { name: "Withdraw quote" }).first().click();
  const dialog = marco.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Withdraw quote" }).click();
  await expect(marco.page.getByText("You withdrew your quote")).toBeVisible({ timeout: 60_000 });
  expect(dbGet<{ status: string }>("SELECT status FROM quotes WHERE id = ?", quote?.id ?? "")?.status).toBe("withdrawn");

  await page.goto(`/requests/${requestId}`);
  await expect(page.getByRole("link", { name: "Select Marco R.'s quote" })).toHaveCount(0);
  await expect(page.getByText("Withdrawn").first()).toBeVisible();
});
