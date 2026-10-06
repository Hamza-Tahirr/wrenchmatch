import {
  expectPath,
  formLogin,
  logOut,
  oneClickLogin,
  SAMPLE_ACCOUNTS,
  SAMPLE_PASSWORD,
  signUp,
  submitLoginForm,
  submitSignupForm,
  testEmail,
} from "./support/auth";
import { dbGet } from "./support/db";
import { expect, runTag, test } from "./support/fixtures";

test.describe("sign up", () => {
  test("a new customer signs up and lands on the request form", async ({ newSession }) => {
    const { page } = await newSession({ uniqueIp: true });
    const tag = runTag();
    const email = testEmail("e2e.customer", tag);
    await signUp(page, { role: "customer", displayName: `Test Customer ${tag}`, email, password: "a-strong-password-1" });
    await expect(page.getByRole("form", { name: "Repair request" })).toBeVisible();
    const user = dbGet<{ role: string; email_verified_at: string | null }>(
      "SELECT role, email_verified_at FROM users WHERE email = ?",
      email,
    );
    expect(user?.role).toBe("customer");
  });

  test("a new mechanic signs up and lands on the application", async ({ newSession }) => {
    test.slow();
    const { page } = await newSession({ uniqueIp: true });
    const tag = runTag();
    const email = testEmail("e2e.mechanic", tag);
    await signUp(page, { role: "mechanic", displayName: `Test Mechanic ${tag}`, email, password: "a-strong-password-1" });
    await expect(page.getByRole("heading", { name: "Apply to receive repair jobs" })).toBeVisible();
    expect(dbGet<{ role: string }>("SELECT role FROM users WHERE email = ?", email)?.role).toBe("mechanic");
  });

  test("an email that already has an account is refused", async ({ newSession }) => {
    const { page } = await newSession({ uniqueIp: true });
    await submitSignupForm(page, {
      role: "customer",
      displayName: "Someone Else",
      email: SAMPLE_ACCOUNTS.dana.email,
      password: "a-strong-password-1",
    });
    await expect(page.getByText("An account with this email already exists").first()).toBeVisible();
    await expect(page.locator("#field-email")).toHaveAttribute("aria-invalid", "true");
    await expectPath(page, "/signup");
  });

  test("a password shorter than 10 characters is refused", async ({ newSession }) => {
    const { page } = await newSession({ uniqueIp: true });
    const tag = runTag();
    await submitSignupForm(page, {
      role: "customer",
      displayName: `Short ${tag}`,
      email: testEmail("e2e.short", tag),
      password: "short1",
    });
    await expect(page.getByText("Use at least 10 characters for your password.").first()).toBeVisible();
    await expect(page.locator("#field-password")).toHaveAttribute("aria-invalid", "true");
    await expectPath(page, "/signup");
    expect(dbGet("SELECT id FROM users WHERE email = ?", testEmail("e2e.short", tag))).toBeUndefined();
  });
});

test.describe("log in", () => {
  test("a wrong password or an unknown email gets the same generic error", async ({ newSession }) => {
    test.slow();
    const { page } = await newSession({ uniqueIp: true });
    const tag = runTag();
    const email = testEmail("e2e.login", tag);
    const password = "a-strong-password-1";
    await signUp(page, { role: "customer", displayName: `Login ${tag}`, email, password });
    await logOut(page);

    await page.goto("/login");
    await submitLoginForm(page, email, "not-the-right-password");
    const generic = page.getByText("Email or password is incorrect.").first();
    await expect(generic).toBeVisible();
    await expectPath(page, "/login");

    await page.goto("/login");
    await submitLoginForm(page, testEmail("e2e.nobody", tag), "not-the-right-password");
    await expect(generic).toBeVisible();
    await expect(page.getByText(/no account|not registered|doesn't exist/i)).toHaveCount(0);

    // The right password still works afterwards.
    await formLogin(page, email, password, "/account");
  });

  for (const who of ["dana", "marco", "avery"] as const) {
    test(`one-click login as ${SAMPLE_ACCOUNTS[who].name} lands on ${SAMPLE_ACCOUNTS[who].home}`, async ({ page }) => {
      await oneClickLogin(page, who);
      await expectPath(page, SAMPLE_ACCOUNTS[who].home);
    });

    test(`form login as ${SAMPLE_ACCOUNTS[who].name} lands on ${SAMPLE_ACCOUNTS[who].home}`, async ({ page }) => {
      await formLogin(page, SAMPLE_ACCOUNTS[who].email, SAMPLE_PASSWORD, SAMPLE_ACCOUNTS[who].home);
    });
  }

  test("logging out ends the session", async ({ page }) => {
    test.slow();
    await oneClickLogin(page, "dana");
    await logOut(page);
    await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
    await page.goto("/account");
    await expectPath(page, "/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/account");
  });
});
