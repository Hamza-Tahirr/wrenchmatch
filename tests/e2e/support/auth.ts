import { expect, type Page } from "@playwright/test";

// Logging in and signing up through the real UI.

/** Password of every seeded sample account (docs/DEMO_DATA.md). */
export const SAMPLE_PASSWORD = "repair-pilot-2026";

/** Display names on the one-click sample-login panel, with their emails and landing pages. */
export const SAMPLE_ACCOUNTS = {
  dana: { name: "Dana", email: "customer@example.com", role: "customer", home: "/account" },
  luis: { name: "Luis", email: "customer2@example.com", role: "customer", home: "/account" },
  marco: { name: "Marco R.", email: "mechanic@example.com", role: "mechanic", home: "/mechanic/jobs" },
  priya: { name: "Priya S.", email: "mechanic2@example.com", role: "mechanic", home: "/mechanic/jobs" },
  sam: { name: "Sam's Garage", email: "garage@example.com", role: "mechanic", home: "/mechanic/jobs" },
  jordan: { name: "Jordan T.", email: "jordan@example.com", role: "mechanic", home: "/mechanic/jobs" },
  alex: { name: "Alex K.", email: "applicant@example.com", role: "mechanic", home: "/mechanic/jobs" },
  taylor: { name: "Taylor M.", email: "suspended@example.com", role: "mechanic", home: "/mechanic/jobs" },
  morgan: { name: "Morgan L.", email: "expired@example.com", role: "mechanic", home: "/mechanic/jobs" },
  casey: { name: "Casey D.", email: "rejected@example.com", role: "mechanic", home: "/mechanic/jobs" },
  avery: { name: "Avery", email: "admin@example.com", role: "admin", home: "/admin" },
} as const;

export type SampleKey = keyof typeof SAMPLE_ACCOUNTS;
type Role = (typeof SAMPLE_ACCOUNTS)[SampleKey]["role"];

const ROLE_TAB: Readonly<Record<Role, RegExp>> = {
  customer: /^Customer/,
  mechanic: /^Mechanic/,
  admin: /^Admin/,
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Path + query of the page's current URL. */
export function currentPath(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

/** Waits until the page is on `path` (exact pathname). */
export async function expectPath(page: Page, path: string | RegExp): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, { message: `expected to be on ${String(path)}`, timeout: 110_000 })
    .toMatch(typeof path === "string" ? new RegExp(`^${escapeRegExp(path)}$`) : path);
}

/**
 * Logs in with the one-click "Log in as <name>" button on /login (opening the right role tab
 * first when the panel groups accounts by role) and waits for the role's landing page.
 */
export async function oneClickLogin(page: Page, who: SampleKey, options: { next?: string } = {}): Promise<void> {
  const account = SAMPLE_ACCOUNTS[who];
  const loginUrl = options.next ? `/login?next=${encodeURIComponent(options.next)}` : "/login";
  await page.goto(loginUrl);
  const button = page.getByRole("button", { name: new RegExp(`^Log in as ${escapeRegExp(account.name)}`) });
  if (!(await button.isVisible())) {
    const tab = page.getByRole("tab", { name: ROLE_TAB[account.role] });
    if (await tab.count()) await tab.first().click();
  }
  await expect(button).toBeVisible();
  await button.click();
  await expectPath(page, options.next ? new URL(options.next, "http://x").pathname : account.home);
}

/** Fills in and sends the email + password form on /login (no navigation check). */
export async function submitLoginForm(page: Page, email: string, password: string): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith("/login")) await page.goto("/login");
  const form = page.locator("form").filter({ has: page.locator("#field-password") });
  await form.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await form.locator("#field-password").fill(password);
  await form.getByRole("button", { name: "Log in", exact: true }).click();
}

/** Logs in through the email + password form and waits for `landing`. */
export async function formLogin(page: Page, email: string, password: string, landing: string): Promise<void> {
  await page.goto("/login");
  await submitLoginForm(page, email, password);
  await expectPath(page, landing);
}

export type SignupInput = {
  role: "customer" | "mechanic";
  displayName: string;
  email: string;
  password: string;
  confirmPassword?: string;
  acceptTerms?: boolean;
};

/** Fills in and sends the sign-up form (no navigation check). */
export async function submitSignupForm(page: Page, input: SignupInput): Promise<void> {
  await page.goto(input.role === "mechanic" ? "/signup?role=mechanic" : "/signup");
  const radio = page.locator(`#field-role-${input.role}`);
  await page.locator(`label[for="field-role-${input.role}"]`).click();
  await expect(radio).toBeChecked();
  await page.locator("#field-displayName").fill(input.displayName);
  await page.locator("#field-email").fill(input.email);
  await page.locator("#field-password").fill(input.password);
  await page.locator("#field-confirmPassword").fill(input.confirmPassword ?? input.password);
  if (input.acceptTerms ?? true) await page.locator("#field-acceptTerms").check();
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Signs up through the UI and waits for the post-signup page (/request or /mechanic/apply). */
export async function signUp(page: Page, input: SignupInput): Promise<void> {
  await submitSignupForm(page, input);
  await expectPath(page, input.role === "mechanic" ? "/mechanic/apply" : "/request");
}

/** A unique @example.com address for a test account. */
export function testEmail(prefix: string, tag: string): string {
  return `${prefix}.${tag.toLowerCase()}@example.com`;
}

/** Logs out with the header's "Log out" button (desktop) or the menu panel (phones). */
export async function logOut(page: Page): Promise<void> {
  const desktop = page.getByRole("button", { name: "Log out" }).first();
  if (!(await desktop.isVisible())) await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Log out" }).filter({ visible: true }).first().click();
  await expectPath(page, "/");
}
