import { expectPath, oneClickLogin, signUp, testEmail } from "./support/auth";
import { addDays, freeSlot, nextWeekday } from "./support/dates";
import { dbGet, dbValue, userIdByEmail } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";
import { phonePattern, sendQuote, submitRequest } from "./support/flows";

type BookingRow = {
  id: string;
  status: string;
  labor_cents: number;
  total_cents: number;
  platform_fee_cents: number;
  platform_fee_bps: number;
  payment_state: string;
};

test("selecting a quote creates a pending reservation with the breakdown and an honest payment state; a second selection fails; the reservation can be cancelled", async ({ newSession, consoleGuard }) => {
  // Several people and many page loads on a dev server that recompiles while others edit code.
  test.setTimeout(900_000);
  const tag = runTag();
  const model = `Camry ${tag}`;
  // Priya's sample insurance runs out about 3 weeks after seeding: keep the job within it.
  const preferredDate = nextWeekday(3);
  const marcoId = userIdByEmail("mechanic@example.com");
  const priyaId = userIdByEmail("mechanic2@example.com");

  // A new customer asks for an oil change on a Toyota in Tempe.
  const customer = await newSession({ uniqueIp: true });
  const email = testEmail("e2e.select", tag);
  await signUp(customer.page, { role: "customer", displayName: `Selector ${tag}`, email, password: "a-strong-password-1" });
  const requestId = await submitRequest(customer.page, {
    zip: "85281",
    streetAddress: "1200 S Example Ave",
    city: "Tempe",
    year: "2017",
    make: "Toyota",
    model,
    mileage: "88000",
    categoryId: "oil_change",
    description: `Oil change and a quick look at the fluids. Ref ${tag}.`,
    drivable: "yes",
    preferredDate,
    window: "morning",
    serviceMode: "mobile",
    phone: "480-555-0123",
  });
  for (const id of [marcoId, priyaId]) {
    expect(dbValue("SELECT count(*) FROM job_matches WHERE request_id = ? AND mechanic_id = ?", requestId, id)).toBe(1);
  }

  // Marco and Priya both quote.
  const marcoSlot = freeSlot(marcoId, [preferredDate, addDays(preferredDate, 1)], 60);
  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto(`/mechanic/jobs/${requestId}`);
  await sendQuote(marco.page, {
    labor: "110.00",
    parts: [{ description: "Synthetic oil and filter", unitPrice: "42.00" }],
    taxes: [{ description: "Sales tax on parts", amount: "3.61" }],
    earliestStart: marcoSlot,
    scope: "Oil and filter change, fluid top-up and a visual check.",
  });

  const priyaSlot = freeSlot(priyaId, [preferredDate, addDays(preferredDate, 1)], 60);
  const priya = await newSession();
  await oneClickLogin(priya.page, "priya");
  await priya.page.goto(`/mechanic/jobs/${requestId}`);
  await sendQuote(priya.page, {
    labor: "95.00",
    parts: [{ description: "Oil and filter", unitPrice: "39.00" }],
    earliestStart: priyaSlot,
    scope: "Oil and filter change.",
  });
  const priyaQuote = dbGet<{ id: string }>("SELECT id FROM quotes WHERE request_id = ? AND mechanic_id = ?", requestId, priyaId);
  expect(priyaQuote).toBeTruthy();

  // A second tab already shows Priya's quote ready to reserve.
  const secondTab = await customer.context.newPage();
  consoleGuard.watch(secondTab);
  await secondTab.goto(`/requests/${requestId}/select/${priyaQuote?.id}`);
  await expect(secondTab.getByRole("button", { name: /^Reserve/ })).toBeVisible();

  // The customer selects Marco's quote: review, agree, reserve.
  const { page: customerPage } = customer;
  await customerPage.goto(`/requests/${requestId}`);
  await customerPage.getByRole("link", { name: "Select Marco R.'s quote" }).first().click();
  await expectPath(customerPage, /^\/requests\/[0-9a-f-]{36}\/select\/[0-9a-f-]{36}$/);
  const reserve = customerPage.getByRole("button", { name: /^Reserve/ });
  await reserve.click();
  await expect(customerPage.getByText("Please confirm before reserving")).toBeVisible();
  const consents = customerPage.locator('input[type="checkbox"][name="acceptedConsentKeys"]');
  await expect(consents).toHaveCount(3);
  for (const box of await consents.all()) await box.check();
  await reserve.click();
  await expectPath(customerPage, /^\/bookings\/[0-9a-f-]{36}$/);
  const bookingId = new URL(customerPage.url()).pathname.split("/")[2];

  const booking = dbGet<BookingRow>(
    "SELECT id, status, labor_cents, total_cents, platform_fee_cents, platform_fee_bps, payment_state FROM bookings WHERE id = ?",
    bookingId,
  );
  expect(booking).toMatchObject({ status: "pending_payment", labor_cents: 11000, total_cents: 15561, payment_state: "stripe_not_connected" });
  expect(booking?.platform_fee_cents).toBe(Math.floor((11000 * 1000 + 5000) / 10000));

  // The reservation page: itemized breakdown, platform fee = 10% of labor, total, and no payment.
  await expect(customerPage.getByText("Pending payment").first()).toBeVisible();
  await expect(customerPage.getByRole("row", { name: /^Labor\s*\$110\.00$/ }).first()).toBeVisible();
  await expect(customerPage.getByRole("row", { name: /^Synthetic oil and filter\s*\$42\.00$/ }).first()).toBeVisible();
  await expect(customerPage.getByRole("row", { name: /^Sales tax on parts\s*\$3\.61$/ }).first()).toBeVisible();
  await expect(customerPage.getByRole("row", { name: /^(Total|You pay)\s*\$155\.61$/ }).first()).toBeVisible();
  await expect(customerPage.getByText(/platform fee of \$11\.00 \(10% of labor\)/).first()).toBeVisible();
  await expect(customerPage.getByText(/Platform fee \(provisional, 10% of labor\):\s*\$11\.00/).first()).toBeVisible();
  await expect(customerPage.getByText("Online payments are coming soon").first()).toBeVisible();
  await expect(customerPage.getByRole("button", { name: "Pay securely online" })).toBeDisabled();
  await expect(customerPage.locator('input[autocomplete^="cc-"], input[name*="card" i]')).toHaveCount(0);

  // No mechanic contact details before a confirmed booking.
  const marcoPrivate = dbGet<{ phone: string; contact_email: string }>(
    "SELECT phone, contact_email FROM mechanic_private WHERE user_id = ?",
    marcoId,
  );
  const html = await customerPage.content();
  const text = await customerPage.locator("body").innerText();
  expect(marcoPrivate?.phone).toBeTruthy();
  expect(text).not.toMatch(phonePattern(marcoPrivate?.phone ?? "0000000000"));
  expect(html).not.toMatch(phonePattern(marcoPrivate?.phone ?? "0000000000"));
  expect(html).not.toContain(marcoPrivate?.contact_email ?? "<missing>");

  // The stale second tab tries to reserve Priya's quote: refused.
  for (const box of await secondTab.locator('input[type="checkbox"][name="acceptedConsentKeys"]').all()) await box.check();
  await secondTab.getByRole("button", { name: /^Reserve/ }).click();
  await expect(secondTab.getByRole("alert").filter({ hasText: /can.t be reserved|couldn.t reserve|already/i }).first()).toBeVisible({
    timeout: 60_000,
  });
  expect(dbValue("SELECT count(*) FROM bookings WHERE request_id = ?", requestId)).toBe(1);
  await secondTab.close();

  // Cancel the reservation.
  await customerPage.reload();
  await customerPage.getByRole("button", { name: "Cancel reservation" }).first().click();
  const dialog = customerPage.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel reservation" }).click();
  await expect(customerPage.getByText("This reservation was cancelled").first()).toBeVisible({ timeout: 60_000 });
  expect(dbGet<{ status: string }>("SELECT status FROM bookings WHERE id = ?", bookingId)?.status).toBe("cancelled");
});
