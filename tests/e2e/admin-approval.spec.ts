import { expectPath, oneClickLogin, signUp, testEmail } from "./support/auth";
import { addDays, phoenixToday } from "./support/dates";
import { dbAll, dbGet, userIdByEmail } from "./support/db";
import { makeJpeg, makePdf } from "./support/files";
import { expect, runTag, test } from "./support/fixtures";
import { chooseRadio } from "./support/flows";

test("a new mechanic applies with documents; the admin verifies them and approves; the job board opens", async ({ newSession }) => {
  // Several people and many page loads on a dev server that recompiles while others edit code.
  test.setTimeout(600_000);
  const tag = runTag();
  const name = `Rivera Mobile ${tag}`;
  const email = testEmail("e2e.applicant", tag);

  // Sign up as a mechanic and send a complete application.
  const mechanic = await newSession({ uniqueIp: true });
  const { page } = mechanic;
  await signUp(page, { role: "mechanic", displayName: name, email, password: "a-strong-password-1" });
  await expect(page.locator("#field-displayName")).toHaveValue(name);
  await page.locator("#field-legalName").fill(`Sam Rivera ${tag}`);
  await page.locator("#field-phone").fill("480-555-0166");
  await expect(page.locator("#field-contactEmail")).toHaveValue(email);
  await page.locator("#field-yearsExperience").fill("7");
  await page.locator("#field-certifications").fill("ASE A1, A4 (self-reported)");
  await page.locator("#field-bio").fill("Mobile maintenance and diagnostics around Tempe and Mesa.");
  await chooseRadio(page, "serviceMode", "mobile");
  await page.locator("#field-baseZip").fill("85281");
  await page.locator("#field-travelRadiusMiles").fill("15");
  for (const service of ["oil_change", "filters", "wipers", "battery_replacement"]) {
    await page.locator(`[id="field-services-${service}"]`).check();
  }
  await page.locator("#field-insuranceProvider").fill("Sample Mutual (test)");
  await page.locator("#field-insurancePolicyNumber").fill(`SMPL-E2E-${tag}`);
  await page.locator("#field-insuranceExpiresOn").fill(addDays(phoenixToday(), 300));
  await page.locator("#field-idDocument").setInputFiles({ ...(await makeJpeg(`photo-id-${tag}.jpg`, { width: 640, height: 400 })) });
  await page.locator("#field-insuranceDocument").setInputFiles({ ...makePdf(`insurance-${tag}.pdf`, "Sample insurance certificate") });
  await page.locator("#field-profilePhoto").setInputFiles({ ...(await makeJpeg(`profile-${tag}.jpg`)) });
  await page.locator("#field-acceptTerms").check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expectPath(page, "/mechanic/profile");

  const mechanicId = userIdByEmail(email);
  const profile = dbGet<{ status: string }>("SELECT status FROM mechanic_profiles WHERE user_id = ?", mechanicId);
  expect(profile?.status).toBe("applied");
  const documents = dbAll<{ kind: string; status: string }>("SELECT kind, status FROM mechanic_documents WHERE mechanic_id = ? ORDER BY kind", mechanicId);
  expect(documents).toEqual([
    { kind: "id_document", status: "pending" },
    { kind: "insurance", status: "pending" },
  ]);

  // Before approval the job board explains the wait instead of listing jobs.
  await page.goto("/mechanic/jobs");
  await expect(page.getByRole("heading", { name: "Pending admin review" })).toBeVisible();

  // The admin finds the application, verifies both documents and approves.
  const admin = await newSession();
  await oneClickLogin(admin.page, "avery");
  await admin.page.goto(`/admin/mechanics?query=${encodeURIComponent(tag)}`);
  await admin.page.getByRole("link", { name: new RegExp(`(Review|Open) ${name}`) }).first().click();
  await expectPath(admin.page, `/admin/mechanics/${mechanicId}`);

  for (const kind of ["photo id", "insurance certificate"]) {
    await admin.page.getByRole("button", { name: `Verify ${kind}` }).click();
    const dialog = admin.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Mark verified" }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    // The page refreshes with the decision (the document no longer offers "Verify").
    await expect(admin.page.getByRole("button", { name: `Verify ${kind}` })).toHaveCount(0, { timeout: 60_000 });
  }
  expect(dbAll<{ status: string }>("SELECT status FROM mechanic_documents WHERE mechanic_id = ?", mechanicId).map((row) => row.status)).toEqual([
    "verified",
    "verified",
  ]);

  await admin.page.getByRole("button", { name: "Approve", exact: true }).click();
  const approve = admin.page.getByRole("dialog");
  await expect(approve).toBeVisible();
  await approve.getByRole("button", { name: "Approve mechanic" }).click();
  await expect(approve).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => dbGet<{ status: string }>("SELECT status FROM mechanic_profiles WHERE user_id = ?", mechanicId)?.status).toBe("approved");
  await expect(admin.page.getByText("Approved").first()).toBeVisible();

  // The mechanic's job board is now open for matches.
  await page.goto("/mechanic/jobs");
  await expect(page.getByRole("heading", { name: "Pending admin review" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^New/ })).toBeVisible();
  await expect(page.getByText("No job matches while your account can't take jobs")).toHaveCount(0);
});

test("only admins can open /admin: other roles see access denied, signed-out visitors are sent to log in", async ({ page, newSession, request }) => {
  test.slow();
  const signedOut = await request.get("/admin", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers()["location"]).toBe("/login?next=%2Fadmin");

  await page.goto("/admin/mechanics");
  await expectPath(page, "/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/mechanics");

  for (const who of ["dana", "marco"] as const) {
    const session = await newSession();
    await oneClickLogin(session.page, who);
    await session.page.goto("/admin");
    await expectPath(session.page, "/access-denied");
    await expect(session.page.getByText("Not available for your account")).toBeVisible();
    await expect(session.page.getByRole("heading", { level: 1 })).toContainText(/admin/i);
  }
});
