import { expect, type Locator, type Page } from "@playwright/test";

import { expectPath } from "./auth";
import type { UploadFile } from "./files";

// Multi-step UI flows shared by several specs: the repair-request wizard and the quote form.

/** Picks a radio card by its group name and value (clicks its label, which covers the card). */
export async function chooseRadio(scope: Page | Locator, name: string, value: string): Promise<void> {
  const id = `field-${name}-${value.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const input = scope.locator(`[id="${id}"]`);
  if (!(await input.isChecked())) await scope.locator(`label[for="${id}"]`).click();
  await expect(input).toBeChecked();
}

export type RequestInput = {
  zip: string;
  streetAddress?: string;
  city?: string;
  locationNotes?: string;
  year: string;
  make: string;
  model: string;
  mileage: string;
  categoryId: string;
  description: string;
  drivable: "yes" | "no";
  photos?: readonly UploadFile[];
  video?: UploadFile;
  preferredDate: string;
  window: "morning" | "afternoon" | "evening" | "flexible";
  serviceMode: "mobile" | "garage" | "either";
  phone: string;
  email?: string;
};

function wizardStep(page: Page, id: string): Locator {
  return page.locator(`section#${id}`);
}

/** Clicks the wizard's "Next" button and waits for step `nextStepId` to show. */
async function nextStep(page: Page, nextStepId: string): Promise<void> {
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(wizardStep(page, nextStepId)).toBeVisible();
}

/** Fills in step 1 (location) of the request wizard on /request. */
export async function fillLocationStep(page: Page, input: Pick<RequestInput, "zip" | "streetAddress" | "city" | "locationNotes">): Promise<void> {
  const step = wizardStep(page, "location");
  await expect(step).toBeVisible();
  await step.locator("#field-zip").fill(input.zip);
  await step.locator("#field-streetAddress").fill(input.streetAddress ?? "");
  await step.locator("#field-city").fill(input.city ?? "");
  await step.locator("#field-locationNotes").fill(input.locationNotes ?? "");
}

/**
 * Goes through the five wizard steps on /request with `input` (the page must be on /request,
 * signed in as a customer). Leaves the last step open with the consents ticked.
 */
export async function fillRequestWizard(page: Page, input: RequestInput): Promise<void> {
  await expect(page.getByRole("form", { name: "Repair request" })).toBeVisible();
  await fillLocationStep(page, input);
  await nextStep(page, "vehicle");

  const vehicle = wizardStep(page, "vehicle");
  await vehicle.locator("#field-vehicleYear").selectOption(input.year);
  await vehicle.locator("#field-vehicleMake").selectOption(input.make);
  await vehicle.locator("#field-vehicleModel").fill(input.model);
  await vehicle.locator("#field-mileage").fill(input.mileage);
  await nextStep(page, "problem");

  const problem = wizardStep(page, "problem");
  await chooseRadio(problem, "categoryId", input.categoryId);
  await problem.locator("#field-description").fill(input.description);
  await chooseRadio(problem, "drivable", input.drivable);
  if (input.photos?.length) {
    await problem.locator("#field-photos").setInputFiles(input.photos.map((file) => ({ ...file })));
    await expect(problem.getByText(`${input.photos.length} ${input.photos.length === 1 ? "photo" : "photos"} chosen.`)).toBeAttached();
  }
  if (input.video) {
    await problem.locator("#field-video").setInputFiles({ ...input.video });
    await expect(problem.getByText("1 video chosen.")).toBeAttached();
  }
  await nextStep(page, "schedule");

  const schedule = wizardStep(page, "schedule");
  await schedule.locator("#field-preferredDate").fill(input.preferredDate);
  await chooseRadio(schedule, "preferredWindow", input.window);
  await chooseRadio(schedule, "serviceMode", input.serviceMode);
  await nextStep(page, "contact");

  const contact = wizardStep(page, "contact");
  await contact.locator("#field-contactPhone").fill(input.phone);
  if (input.email) await contact.locator("#field-contactEmail").fill(input.email);
  const consents = contact.locator('input[type="checkbox"][name="acceptedConsentKeys"]');
  await expect(consents).toHaveCount(3);
  for (const box of await consents.all()) await box.check();
}

/** Sends the request from the wizard's last step and returns the new request's id. */
export async function sendRequest(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Send request" }).click();
  await expectPath(page, /^\/requests\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/")[2];
}

/** Opens /request, fills in the wizard and sends it; returns the new request's id. */
export async function submitRequest(page: Page, input: RequestInput): Promise<string> {
  await page.goto("/request");
  await fillRequestWizard(page, input);
  return sendRequest(page);
}

export type QuoteInput = {
  labor: string;
  parts?: ReadonlyArray<{ description: string; quantity?: string; unitPrice: string }>;
  taxes?: ReadonlyArray<{ description: string; amount: string }>;
  fees?: ReadonlyArray<{ description: string; amount: string }>;
  /** Phoenix local "YYYY-MM-DDTHH:mm". */
  earliestStart: string;
  durationMinutes?: string;
  serviceMode?: "mobile" | "garage";
  scope: string;
  validityHours?: string;
};

/** The quote form on a job page (/mechanic/jobs/<id>). */
export function quoteForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.locator('input[name="laborPrice"]') });
}

/** Fills in the quote form on a job page (no submit). */
export async function fillQuoteForm(page: Page, input: QuoteInput): Promise<void> {
  const form = quoteForm(page);
  await expect(form).toBeVisible();
  await form.locator('input[name="laborPrice"]').fill(input.labor);
  const parts = input.parts ?? [];
  await chooseRadio(form, "partsIncluded", parts.length > 0 ? "yes" : "no");
  for (const [index, part] of parts.entries()) {
    if (index > 0) await form.getByRole("button", { name: "Add part" }).click();
    await form.locator(`input[name="parts.${index}.description"]`).fill(part.description);
    await form.locator(`input[name="parts.${index}.quantity"]`).fill(part.quantity ?? "1");
    await form.locator(`input[name="parts.${index}.unitPrice"]`).fill(part.unitPrice);
  }
  for (const [index, tax] of (input.taxes ?? []).entries()) {
    await form.getByRole("button", { name: "Add tax line" }).click();
    await form.locator(`input[name="taxes.${index}.description"]`).fill(tax.description);
    await form.locator(`input[name="taxes.${index}.amount"]`).fill(tax.amount);
  }
  for (const [index, fee] of (input.fees ?? []).entries()) {
    await form.getByRole("button", { name: "Add fee line" }).click();
    await form.locator(`input[name="fees.${index}.description"]`).fill(fee.description);
    await form.locator(`input[name="fees.${index}.amount"]`).fill(fee.amount);
  }
  await form.locator('input[name="earliestStart"]').fill(input.earliestStart);
  await form.locator('select[name="durationMinutes"]').selectOption(input.durationMinutes ?? "60");
  await chooseRadio(form, "serviceMode", input.serviceMode ?? "mobile");
  await form.locator('textarea[name="scope"]').fill(input.scope);
  await form.locator('select[name="validityHours"]').selectOption(input.validityHours ?? "48");
}

/** Fills in and sends a quote; waits for the "Quote sent" confirmation. */
export async function sendQuote(page: Page, input: QuoteInput): Promise<void> {
  await fillQuoteForm(page, input);
  await quoteForm(page).getByRole("button", { name: "Send quote" }).click();
  await expect(page.getByRole("heading", { name: "Quote sent" })).toBeVisible({ timeout: 60_000 });
}

/** Opens a job from the mechanic's job board (New tab) by its card link. */
export async function openJobFromBoard(page: Page, vehicleLabel: string): Promise<void> {
  await page.goto("/mechanic/jobs");
  const link = page.getByRole("link", { name: new RegExp(`^View job: ${vehicleLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
  await expect(link.first()).toBeVisible();
  await link.first().click();
  await expectPath(page, /^\/mechanic\/jobs\/[0-9a-f-]{36}$/);
}

/**
 * Matches a US phone number in any common layout ("602-555-0142", "(602) 555-0142",
 * "6025550142", "+1 602 555 0142").
 */
export function phonePattern(phone: string): RegExp {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) throw new Error(`Not a 10-digit phone number: ${phone}`);
  return new RegExp(digits.split("").join("[\\s().-]{0,2}"));
}

/** Dollars "$1,234.56" for integer cents, as the app formats them. */
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
