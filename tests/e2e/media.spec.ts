import type { Locator, Page } from "@playwright/test";

import { oneClickLogin } from "./support/auth";
import { dbAll, dbGet, dbValue, userIdByEmail } from "./support/db";
import { makeJpeg, type UploadFile } from "./support/files";
import { expect, runTag, test } from "./support/fixtures";

// Pictures people add (docs/MEDIA.md): profile picture, more request photos, a mechanic's
// work gallery and before/after photos on a booking, each visible only to the right people.

/** The media Dropzone form whose drop area says `label`. */
function dropzone(page: Page, label: string): Locator {
  return page.locator("form").filter({ hasText: label }).filter({ has: page.locator('input[type="file"]') }).first();
}

/** Chooses `files` in a Dropzone and sends them ("Add 1 picture"). */
async function uploadWith(zone: Locator, files: readonly UploadFile[]): Promise<void> {
  await zone.locator('input[type="file"]').setInputFiles(files.map((file) => ({ ...file })));
  const submit = zone.getByRole("button", { name: new RegExp(`^(Add|Upload) ${files.length} pictures?$`) });
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function newestId(sql: string, previous: readonly string[], ...params: string[]): Promise<string> {
  let found: string | undefined;
  await expect
    .poll(
      () => {
        found = dbAll<{ id: string }>(sql, ...params)
          .map((row) => row.id)
          .find((id) => !previous.includes(id));
        return found ?? null;
      },
      { timeout: 60_000, message: "waiting for the upload to be stored" },
    )
    .not.toBeNull();
  return found ?? "";
}

test("Dana sets a profile picture", async ({ page }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const before = dbGet<{ avatar_file_id: string | null }>("SELECT avatar_file_id FROM users WHERE id = ?", danaId)?.avatar_file_id ?? null;
  await oneClickLogin(page, "dana");
  await page.goto("/account/photo");
  await page.locator('main input[type="file"]').first().setInputFiles({ ...(await makeJpeg("dana-avatar.jpg", { width: 600, height: 600 })) });
  await expect(page.getByRole("img", { name: "Preview of your new profile picture" })).toBeVisible();
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect
    .poll(() => dbGet<{ avatar_file_id: string | null }>("SELECT avatar_file_id FROM users WHERE id = ?", danaId)?.avatar_file_id ?? null, {
      timeout: 60_000,
    })
    .not.toBe(before);
  const after = dbGet<{ avatar_file_id: string }>("SELECT avatar_file_id FROM users WHERE id = ?", danaId)?.avatar_file_id;
  const file = dbGet<{ purpose: string; metadata_stripped: number; width: number }>(
    "SELECT purpose, metadata_stripped, width FROM files WHERE id = ?",
    after ?? "",
  );
  expect(file).toMatchObject({ purpose: "user_avatar", metadata_stripped: 1 });
  expect(file?.width).toBeLessThanOrEqual(512);
  await page.reload();
  await expect(page.locator(`img[src^="/api/files/${after}"]`).first()).toBeVisible();
  // The old picture is gone for good.
  if (before) expect((await page.request.get(`/api/files/${before}`)).status()).toBe(404);
});

test("Dana adds a photo to an open request and the matched mechanic sees it", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const marcoId = userIdByEmail("mechanic@example.com");
  const target = dbGet<{ id: string }>(
    `SELECT r.id FROM repair_requests r JOIN job_matches jm ON jm.request_id = r.id AND jm.mechanic_id = ?
      WHERE r.customer_id = ? AND r.status IN ('open', 'quoted') AND r.expires_at > ? AND jm.status <> 'passed'
        AND (SELECT count(*) FROM request_media m WHERE m.request_id = r.id AND m.kind = 'photo') < 8
      ORDER BY r.submitted_at DESC LIMIT 1`,
    marcoId,
    danaId,
    new Date().toISOString(),
  );
  expect(target, "Dana needs an open request matched to Marco").toBeTruthy();
  const requestId = target?.id ?? "";
  const existing = dbAll<{ id: string }>("SELECT file_id AS id FROM request_media WHERE request_id = ?", requestId).map((row) => row.id);

  await oneClickLogin(page, "dana");
  await page.goto(`/requests/${requestId}`);
  await uploadWith(dropzone(page, "Add photos of the problem"), [await makeJpeg(`extra-${runTag()}.jpg`)]);
  const fileId = await newestId(
    "SELECT file_id AS id FROM request_media WHERE request_id = ? AND kind = 'photo' ORDER BY created_at DESC",
    existing,
    requestId,
  );
  expect(dbGet<{ shareable_before_booking: number }>("SELECT shareable_before_booking FROM request_media WHERE file_id = ?", fileId)).toEqual({
    shareable_before_booking: 1,
  });

  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto(`/mechanic/jobs/${requestId}`);
  await expect(marco.page.locator(`img[src^="/api/files/${fileId}"]`).first()).toBeAttached();
  expect((await marco.page.request.get(`/api/files/${fileId}`)).status()).toBe(200);
});

test("Marco adds a work-gallery photo and Dana sees it on his quote", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const marcoId = userIdByEmail("mechanic@example.com");
  const quoted = dbGet<{ request_id: string }>(
    `SELECT q.request_id FROM quotes q JOIN repair_requests r ON r.id = q.request_id
      WHERE q.mechanic_id = ? AND r.customer_id = ? AND q.status IN ('submitted', 'selected', 'expired')
      ORDER BY CASE q.status WHEN 'submitted' THEN 0 WHEN 'selected' THEN 1 ELSE 2 END, q.created_at DESC LIMIT 1`,
    marcoId,
    danaId,
  );
  expect(quoted, "Dana needs a request with a quote from Marco").toBeTruthy();
  const existing = dbAll<{ id: string }>("SELECT file_id AS id FROM mechanic_gallery WHERE mechanic_id = ?", marcoId).map((row) => row.id);
  expect(existing.length, "Marco's gallery must have room for one more photo").toBeLessThan(12);

  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto("/mechanic/gallery");
  await uploadWith(dropzone(marco.page, "Drop work photos here"), [await makeJpeg(`work-${runTag()}.jpg`, { width: 800, height: 600 })]);
  const fileId = await newestId("SELECT file_id AS id FROM mechanic_gallery WHERE mechanic_id = ? ORDER BY created_at DESC", existing, marcoId);

  await oneClickLogin(page, "dana");
  await page.goto(`/requests/${quoted?.request_id}`);
  // Some element holds both Marco's quote heading and the new picture: it is on his quote card.
  const card = page
    .locator("article, li, section, div")
    .filter({ has: page.getByRole("heading", { name: "Quote from Marco R." }) })
    .filter({ has: page.locator(`img[src^="/api/files/${fileId}"]`) });
  await expect(card.first()).toBeAttached();
  expect((await page.request.get(`/api/files/${fileId}`)).status()).toBe(200);

  // Another customer who never got a quote from Marco can't open it.
  const luis = await newSession();
  await oneClickLogin(luis.page, "luis");
  expect((await luis.page.request.get(`/api/files/${fileId}`)).status()).toBe(404);

  // Clean up: Marco removes the test photo again (the gallery holds 12).
  await marco.page.reload();
  const tile = marco.page.locator("li").filter({ has: marco.page.locator(`img[src^="/api/files/${fileId}"]`) }).first();
  await tile.getByRole("button", { name: /^Remove photo \d+$/ }).click();
  await tile.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => dbValue("SELECT count(*) FROM mechanic_gallery WHERE file_id = ?", fileId), { timeout: 60_000 }).toBe(0);
});

test("before/after photos on a confirmed booking are shared by its customer and mechanic only", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const marcoId = userIdByEmail("mechanic@example.com");
  const booking = dbGet<{ id: string }>(
    `SELECT id FROM bookings WHERE customer_id = ? AND mechanic_id = ? AND status IN ('completed', 'confirmed', 'in_progress')
      AND (SELECT count(*) FROM booking_photos p WHERE p.booking_id = bookings.id) < 38
      ORDER BY CASE status WHEN 'completed' THEN 0 ELSE 1 END, created_at LIMIT 1`,
    danaId,
    marcoId,
  );
  expect(booking, "Dana and Marco need a confirmed (or completed) booking").toBeTruthy();
  const bookingId = booking?.id ?? "";
  const photoSql = "SELECT file_id AS id FROM booking_photos WHERE booking_id = ? AND uploaded_by = ? ORDER BY created_at DESC";
  const tag = runTag();

  // Dana adds a "before" photo.
  await oneClickLogin(page, "dana");
  await page.goto(`/bookings/${bookingId}`);
  const danaZone = dropzone(page, "Add photos to this booking");
  await danaZone.locator('input[name="phase"][value="before"]').check();
  await danaZone.locator('input[name="caption"]').fill(`Before ${tag}`);
  const danaPrevious = dbAll<{ id: string }>(photoSql, bookingId, danaId).map((row) => row.id);
  await uploadWith(danaZone, [await makeJpeg(`before-${tag}.jpg`)]);
  const danaPhoto = await newestId(photoSql, danaPrevious, bookingId, danaId);

  // Marco adds an "after" photo.
  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto(`/mechanic/bookings/${bookingId}`);
  const marcoZone = dropzone(marco.page, "Add photos to this booking");
  await marcoZone.locator('input[name="phase"][value="after"]').check();
  await marcoZone.locator('input[name="caption"]').fill(`After ${tag}`);
  const marcoPrevious = dbAll<{ id: string }>(photoSql, bookingId, marcoId).map((row) => row.id);
  await uploadWith(marcoZone, [await makeJpeg(`after-${tag}.jpg`)]);
  const marcoPhoto = await newestId(photoSql, marcoPrevious, bookingId, marcoId);
  expect(dbAll<{ phase: string }>("SELECT phase FROM booking_photos WHERE file_id IN (?, ?) ORDER BY phase", danaPhoto, marcoPhoto)).toEqual([
    { phase: "after" },
    { phase: "before" },
  ]);

  // Each side sees both photos.
  await page.reload();
  for (const id of [danaPhoto, marcoPhoto]) await expect(page.locator(`img[src^="/api/files/${id}"]`).first()).toBeAttached();
  await marco.page.reload();
  for (const id of [danaPhoto, marcoPhoto]) await expect(marco.page.locator(`img[src^="/api/files/${id}"]`).first()).toBeAttached();

  // Nobody else can open them.
  for (const who of ["luis", "priya"] as const) {
    const other = await newSession();
    await oneClickLogin(other.page, who);
    for (const id of [danaPhoto, marcoPhoto]) {
      expect((await other.page.request.get(`/api/files/${id}`)).status(), `${who} GET booking photo`).toBe(404);
    }
  }
});
