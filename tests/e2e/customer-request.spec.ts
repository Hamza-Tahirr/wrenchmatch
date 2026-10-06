import { expectPath, oneClickLogin, signUp, testEmail } from "./support/auth";
import { nextWeekday } from "./support/dates";
import { dbGet, dbValue, userIdByEmail } from "./support/db";
import { makeJpeg } from "./support/files";
import { expect, runTag, test } from "./support/fixtures";
import { fillLocationStep, fillRequestWizard, submitRequest } from "./support/flows";

test.describe("customer repair requests", () => {
  test("Dana sends an oil change request in 85281 with a photo; the page states the real number of mechanics notified", async ({ page }) => {
    test.slow();
    const tag = runTag();
    await oneClickLogin(page, "dana");
    const requestId = await submitRequest(page, {
      zip: "85281",
      year: "2019",
      make: "Subaru",
      model: "Outback",
      mileage: "61200",
      categoryId: "oil_change",
      description: `Oil change due (reminder light on). Synthetic 0W-20 please. Ref ${tag}.`,
      drivable: "yes",
      photos: [await makeJpeg(`dashboard-${tag}.jpg`)],
      preferredDate: nextWeekday(3),
      window: "morning",
      serviceMode: "mobile",
      phone: "602-555-0148",
    });

    const notified = dbValue("SELECT count(*) FROM job_matches WHERE request_id = ?", requestId);
    const stored = dbGet<{ matched_count: number; status: string; customer_id: string }>(
      "SELECT matched_count, status, customer_id FROM repair_requests WHERE id = ?",
      requestId,
    );
    expect(stored?.customer_id).toBe(userIdByEmail("customer@example.com"));
    expect(notified, "the request should reach at least one mechanic").toBeGreaterThan(0);
    expect(stored?.matched_count).toBe(notified);

    // The header and the confirmation both state the actual number notified.
    const noun = notified === 1 ? "mechanic" : "mechanics";
    await expect(page.getByText(`Sent to ${notified} ${noun}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`We notified ${notified} approved ${noun} near`)).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(`Sent to\\s*${notified}\\s*nearby ${noun}`) })).toBeVisible();

    // The photo was stored with the request (sanitized) and is shown on the request page.
    const photo = dbGet<{ file_id: string; metadata_stripped: number }>(
      `SELECT m.file_id, f.metadata_stripped FROM request_media m JOIN files f ON f.id = m.file_id
        WHERE m.request_id = ? AND m.kind = 'photo'`,
      requestId,
    );
    expect(photo?.metadata_stripped).toBe(1);
    await expect(page.locator(`img[src^="/api/files/${photo?.file_id}"]`).first()).toBeAttached();

    // A reload keeps the honest count (the celebration is shown once).
    await page.reload();
    await expect(page.getByText(`Sent to ${notified} ${noun}`, { exact: true })).toBeVisible();
  });

  test("a pilot ZIP with no mechanic in range gets the honest zero-match state", async ({ newSession }) => {
    test.slow();
    const { page } = await newSession({ uniqueIp: true });
    const tag = runTag();
    const email = testEmail("e2e.maricopa", tag);
    await signUp(page, { role: "customer", displayName: `Maricopa ${tag}`, email, password: "a-strong-password-1" });
    const requestId = await submitRequest(page, {
      zip: "85138",
      year: "2016",
      make: "Ford",
      model: "F-250",
      mileage: "143000",
      categoryId: "battery_replacement",
      description: `Work truck battery is dead at the job site, needs a replacement. Ref ${tag}.`,
      drivable: "no",
      preferredDate: nextWeekday(2),
      window: "flexible",
      serviceMode: "mobile",
      phone: "520-555-0177",
    });

    expect(dbValue("SELECT count(*) FROM job_matches WHERE request_id = ?", requestId)).toBe(0);
    expect(dbValue("SELECT matched_count FROM repair_requests WHERE id = ?", requestId)).toBe(0);
    await expect(page.getByText("No approved mechanics are available for this request yet")).toBeVisible();
    await expect(page.getByText(/nobody was notified/)).toBeVisible();
    await expect(page.getByText(/^Sent to \d+ mechanics?$/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cancel request/ }).first()).toBeVisible();
  });

  test("the request form checks missing fields, ZIPs outside the pilot and short descriptions", async ({ page }) => {
    test.slow();
    await oneClickLogin(page, "dana");
    const danaId = userIdByEmail("customer@example.com");
    const before = dbValue("SELECT count(*) FROM repair_requests WHERE customer_id = ?", danaId);
    await page.goto("/request");
    await expect(page.getByRole("form", { name: "Repair request" })).toBeVisible();

    // "Next" with an empty ZIP points at the missing field.
    await page.locator("#field-zip").fill("");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Fill in ZIP code to continue." })).toBeVisible();
    await expect(page.locator("section#location")).toBeVisible();

    // Flagstaff 86001 is a real ZIP outside the pilot: flagged right away...
    await fillLocationStep(page, { zip: "86001" });
    await expect(page.getByText("86001 isn't in our service area yet.")).toBeVisible();

    // ...and refused by the server with the pilot message when sent anyway.
    await page.goto("/request");
    await fillRequestWizard(page, {
      zip: "86001",
      year: "2014",
      make: "Honda",
      model: "CR-V",
      mileage: "120500",
      categoryId: "wipers",
      description: "Wipers are streaking badly in the rain.",
      drivable: "yes",
      preferredDate: nextWeekday(2),
      window: "afternoon",
      serviceMode: "mobile",
      phone: "928-555-0101",
    });
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("WrenchMatch isn't available in 86001 yet.").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("section#location")).toBeVisible();
    await expect(page.locator("#field-zip")).toHaveAttribute("aria-invalid", "true");
    await expectPath(page, "/request");

    // A too-short description is refused too (the rest of the form is kept).
    await page.locator("#field-zip").fill("85281");
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    const problem = page.locator("section#problem");
    await expect(problem).toBeVisible();
    await problem.locator("#field-description").fill("Squeaks");
    for (const step of ["schedule", "contact"]) {
      await page.getByRole("button", { name: /^Next/ }).click();
      await expect(page.locator(`section#${step}`)).toBeVisible();
    }
    for (const box of await page.locator('input[name="acceptedConsentKeys"]').all()) await box.check();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Add a little more detail: at least 10 characters.").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("section#problem")).toBeVisible();

    expect(dbValue("SELECT count(*) FROM repair_requests WHERE customer_id = ?", danaId)).toBe(before);
    // The refused attempts never reach the request page.
    await expect(page).not.toHaveURL(/\/requests\//);
  });
});

