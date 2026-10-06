import { oneClickLogin } from "./support/auth";
import { dbGet, userIdByEmail } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";
import { chooseRadio } from "./support/flows";

test("Dana raises a help request, the admin resolves it with a note, and Dana sees the answer", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const tag = runTag();
  const message = `My quote shows a tax line I don't understand. Could someone explain it? Ref ${tag}`;
  const resolution = `The tax line is sales tax on the parts only. Nothing is charged online yet. Ref ${tag}`;
  const danaId = userIdByEmail("customer@example.com");

  await oneClickLogin(page, "dana");
  await page.goto("/support");
  await chooseRadio(page, "topic", "quote_question");
  await page.locator("#field-message").fill(message);
  await page.getByRole("button", { name: "Send to the help desk" }).click();
  await expect.poll(() => dbGet<{ status: string }>("SELECT status FROM support_requests WHERE user_id = ? AND message = ?", danaId, message)?.status, {
    timeout: 60_000,
  }).toBe("open");
  const yourRequests = page.locator("section").filter({ has: page.locator("#your-requests-title") });
  const mine = yourRequests.locator("li").filter({ hasText: message }).first();
  await expect(mine).toBeVisible();
  await expect(mine.getByText("Open").first()).toBeVisible();

  // The admin resolves it from the help desk.
  const admin = await newSession();
  await oneClickLogin(admin.page, "avery");
  await admin.page.goto("/admin/support");
  const card = admin.page.locator("article").filter({ hasText: message }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Resolve" }).click();
  const dialog = admin.page.getByRole("dialog").filter({ has: admin.page.getByRole("button", { name: "Resolve request" }) });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: /^Resolution/ }).fill(resolution);
  await dialog.getByRole("button", { name: "Resolve request" }).click();
  await expect(admin.page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => dbGet<{ status: string }>("SELECT status FROM support_requests WHERE user_id = ? AND message = ?", danaId, message)?.status).toBe(
    "resolved",
  );

  // Dana sees the resolution note on her help request.
  await page.reload();
  const resolved = page.locator("li").filter({ hasText: message }).first();
  await expect(resolved.getByText(resolution)).toBeVisible();
  await expect(resolved.getByText(/Resolved/).first()).toBeVisible();
});
