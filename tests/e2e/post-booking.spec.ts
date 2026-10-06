import type { Locator, Page } from "@playwright/test";

import { oneClickLogin } from "./support/auth";
import { dbAll, dbGet, userIdByEmail } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";
import { usd } from "./support/flows";

// The confirmed sample booking (scenario d: Dana's 2012 Ford Escape with Marco) taken through
// start -> change order -> approval -> completion -> invoice -> review -> payout status.
// Only seeded bookings can be past "pending payment" while online payments are not connected,
// so this needs the sample data (npm run db:reset). Every step is one-way, so when an earlier
// run stopped half-way (E2E_SKIP_RESET=1) the test continues from the booking's current state
// and records that in an annotation; a booking this test already finished is not reused.

const EXTRA_WORK = "Replace the split air intake boot";

type BookingRow = { id: string; status: string; total_cents: number };
type ChangeOrderRow = { id: string; status: string; amount_cents: number; description: string };

/** Opens the confirm dialog of `trigger` and presses its `confirm` button. */
async function confirmInDialog(page: Page, trigger: Locator, confirm: string): Promise<void> {
  await trigger.click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: confirm, exact: true }) });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  // The confirm button shows a pending label while the action runs, so wait for every dialog to close.
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
}

function changeOrderItem(page: Page, description: string): Locator {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: description }) }).first();
}

function bookingStatus(bookingId: string): string | undefined {
  return dbGet<{ status: string }>("SELECT status FROM bookings WHERE id = ?", bookingId)?.status;
}

test("Marco starts the confirmed booking and proposes extra work; Dana approves; Marco completes and invoices; Dana reviews; Marco sees the payout", async ({
  page,
  newSession,
}, testInfo) => {
  // Two people, a dozen page loads and server actions on a busy dev server.
  test.setTimeout(900_000);
  const danaId = userIdByEmail("customer@example.com");
  const marcoId = userIdByEmail("mechanic@example.com");
  const booking = dbGet<BookingRow>(
    `SELECT b.id, b.status, b.total_cents FROM bookings b
      WHERE b.customer_id = ? AND b.mechanic_id = ? AND b.is_demo_fixture = 1
        AND (b.status = 'confirmed'
             OR EXISTS (SELECT 1 FROM change_orders c WHERE c.booking_id = b.id AND c.description LIKE ? || '%'))
      ORDER BY CASE b.status WHEN 'confirmed' THEN 1 ELSE 0 END, b.slot_start_at LIMIT 1`,
    danaId,
    marcoId,
    EXTRA_WORK,
  );
  test.skip(!booking, "The confirmed sample booking was already used: run `npm run db:reset` (or the suite without E2E_SKIP_RESET).");
  const bookingId = booking?.id ?? "";
  if (booking && booking.status !== "confirmed") {
    testInfo.annotations.push({ type: "resumed", description: `continued an earlier run from booking status "${booking.status}"` });
  }

  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto(`/mechanic/bookings/${bookingId}`);

  // 1. Marco starts the job.
  if (bookingStatus(bookingId) === "confirmed") {
    await confirmInDialog(marco.page, marco.page.getByRole("button", { name: "Start job" }), "Start job");
    await expect.poll(() => bookingStatus(bookingId), { timeout: 60_000 }).toBe("in_progress");
    await expect(marco.page.getByText("In progress").first()).toBeVisible({ timeout: 60_000 });
  }

  // 2. ...and proposes a change order.
  let changeOrder = dbGet<ChangeOrderRow>(
    "SELECT id, status, amount_cents, description FROM change_orders WHERE booking_id = ? AND description LIKE ? || '%'",
    bookingId,
    EXTRA_WORK,
  );
  if (!changeOrder) {
    const description = `${EXTRA_WORK} ${runTag()}`;
    await marco.page.getByRole("button", { name: "Propose change order" }).click();
    const form = marco.page.getByRole("dialog").filter({ has: marco.page.getByRole("button", { name: "Send for approval" }) });
    await expect(form).toBeVisible();
    await form.locator('textarea[name="description"]').fill(description);
    await form.locator('textarea[name="reason"]').fill("The intake boot between the air box and throttle body is split, so the engine draws unfiltered air.");
    await form.locator('input[name="laborPrice"]').fill("40.00");
    await form.locator('input[name="partsPrice"]').fill("25.00");
    await form.locator('input[name="taxAmount"]').fill("2.15");
    await form.getByRole("button", { name: "Send for approval" }).click();
    await expect(marco.page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
    const lookup = () =>
      dbGet<ChangeOrderRow>(
        "SELECT id, status, amount_cents, description FROM change_orders WHERE booking_id = ? AND description = ?",
        bookingId,
        description,
      );
    await expect.poll(() => lookup() ?? null, { timeout: 60_000, message: "the change order is stored" }).not.toBeNull();
    changeOrder = lookup();
    expect(changeOrder).toMatchObject({ status: "proposed", amount_cents: 6715 });
    await expect(changeOrderItem(marco.page, description)).toBeVisible({ timeout: 60_000 });
  }
  const extraWork = changeOrder?.description ?? "";

  // 3. Dana approves it (and declines any other extra work still waiting for her).
  await oneClickLogin(page, "dana");
  await page.goto(`/bookings/${bookingId}`);
  const item = changeOrderItem(page, extraWork);
  await expect(item).toBeVisible();
  await expect(item.getByText("$67.15").first()).toBeVisible();
  if (changeOrder?.status === "proposed") {
    await confirmInDialog(page, item.getByRole("button", { name: "Approve", exact: true }), "Approve extra work");
  }
  await expect(item.getByText(/You approved this on/)).toBeVisible({ timeout: 60_000 });
  const others = dbAll<{ description: string }>(
    "SELECT description FROM change_orders WHERE booking_id = ? AND status = 'proposed' AND id <> ?",
    bookingId,
    changeOrder?.id ?? "",
  );
  for (const other of others) {
    const otherItem = changeOrderItem(page, other.description);
    await confirmInDialog(page, otherItem.getByRole("button", { name: "Decline", exact: true }), "Decline extra work");
    await expect(otherItem.getByText(/You declined this on/)).toBeVisible({ timeout: 60_000 });
  }
  expect(dbGet<{ status: string }>("SELECT status FROM change_orders WHERE id = ?", changeOrder?.id ?? "")?.status).toBe("approved");

  // 4. Marco completes the job and issues the final invoice.
  await marco.page.reload();
  if (bookingStatus(bookingId) === "in_progress") {
    await confirmInDialog(marco.page, marco.page.getByRole("button", { name: "Complete job" }), "Complete job");
    await expect.poll(() => bookingStatus(bookingId), { timeout: 60_000 }).toBe("completed");
  }
  if (!dbGet("SELECT 1 AS ok FROM invoices WHERE booking_id = ?", bookingId)) {
    await confirmInDialog(marco.page, marco.page.getByRole("button", { name: "Issue final invoice" }), "Issue invoice");
    await expect.poll(() => dbGet("SELECT 1 AS ok FROM invoices WHERE booking_id = ?", bookingId) ?? null, { timeout: 60_000 }).not.toBeNull();
  }
  const approvedExtra = dbAll<{ amount_cents: number }>(
    "SELECT amount_cents FROM change_orders WHERE booking_id = ? AND status = 'approved'",
    bookingId,
  ).reduce((sum, row) => sum + row.amount_cents, 0);
  const invoice = dbGet<{ invoice_number: string; total_cents: number; mechanic_payout_cents: number; platform_fee_cents: number; labor_cents: number }>(
    "SELECT invoice_number, total_cents, mechanic_payout_cents, platform_fee_cents, labor_cents FROM invoices WHERE booking_id = ?",
    bookingId,
  );
  expect(invoice?.total_cents).toBe((booking?.total_cents ?? 0) + approvedExtra);
  expect(invoice?.platform_fee_cents).toBe(Math.floor(((invoice?.labor_cents ?? 0) * 1000 + 5000) / 10000));
  await expect(marco.page.getByText(invoice?.invoice_number ?? "<none>").first()).toBeVisible({ timeout: 60_000 });

  // 5. Dana sees the invoice and leaves a review.
  await page.reload();
  const invoiceSection = page.locator("section#invoice");
  await expect(invoiceSection.getByRole("heading", { name: new RegExp(`Invoice\\s+${invoice?.invoice_number}`) })).toBeVisible();
  await expect(invoiceSection.getByText(usd(invoice?.total_cents ?? 0)).first()).toBeVisible();
  if (!dbGet("SELECT 1 AS ok FROM reviews WHERE booking_id = ?", bookingId)) {
    await page.locator("label").filter({ hasText: "5 stars" }).first().click();
    await expect(page.getByRole("radio", { name: /^5 stars/ })).toBeChecked();
    await page.getByRole("textbox", { name: /^Comment/ }).fill("Quick, tidy and explained the extra part before fitting it.");
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(page.getByRole("region", { name: "Your review" })).toContainText("5 out of 5 stars", { timeout: 60_000 });
  }
  // After the refresh the booking shows the saved review (not counted: no online payment).
  await page.reload();
  const saved = page.getByRole("region", { name: "Your review" });
  await expect(saved).toContainText("5 out of 5 stars");
  await expect(saved).toContainText(/isn.t counted/);
  expect(dbGet<{ rating: number }>("SELECT rating FROM reviews WHERE booking_id = ?", bookingId)?.rating).toBe(5);

  // 6. Marco sees the payout status for the invoiced job (nothing is paid out online).
  await marco.page.reload();
  const payout = marco.page.locator("#payout");
  await expect(payout).toBeVisible();
  expect(dbGet<{ payout_status: string }>("SELECT payout_status FROM bookings WHERE id = ?", bookingId)?.payout_status).toBe("pending");
  await expect(payout.getByText(/pending/i).first()).toBeVisible();
  await expect(payout.getByText(usd(invoice?.mechanic_payout_cents ?? 0)).first()).toBeVisible();
});
