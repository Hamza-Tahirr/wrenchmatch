import { oneClickLogin, signUp, testEmail } from "./support/auth";
import { nextWeekday } from "./support/dates";
import { dbAll, dbGet, userIdByEmail } from "./support/db";
import { makeJpeg, makeMp4 } from "./support/files";
import { expect, runTag, test } from "./support/fixtures";
import { phonePattern, submitRequest } from "./support/flows";

// Unauthorized reads answer "not found" (pages) or 404 (files), never "forbidden".

test.beforeEach(({ consoleGuard }) => {
  // The browser logs its own line for every intentional 404 probe below.
  consoleGuard.allow(/status of 404/);
});

test("other customers and unmatched mechanics get 'not found' for records that aren't theirs", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const priyaId = userIdByEmail("mechanic2@example.com");
  const danaRequest = dbGet<{ id: string }>("SELECT id FROM repair_requests WHERE customer_id = ? ORDER BY created_at LIMIT 1", danaId);
  const danaBooking = dbGet<{ id: string; quote_id: string; request_id: string }>(
    "SELECT id, quote_id, request_id FROM bookings WHERE customer_id = ? ORDER BY created_at LIMIT 1",
    danaId,
  );
  const unmatchedForPriya = dbGet<{ id: string }>(
    `SELECT r.id FROM repair_requests r
      WHERE r.status <> 'draft' AND NOT EXISTS (SELECT 1 FROM job_matches jm WHERE jm.request_id = r.id AND jm.mechanic_id = ?)
      ORDER BY r.created_at LIMIT 1`,
    priyaId,
  );
  expect(danaRequest && danaBooking && unmatchedForPriya).toBeTruthy();

  // Luis (another customer) probes Dana's request, quote selection and booking.
  await oneClickLogin(page, "luis");
  await page.goto(`/requests/${danaRequest?.id}`);
  await expect(page.getByRole("heading", { name: "Request not found" })).toBeVisible();
  await page.goto(`/requests/${danaBooking?.request_id}/select/${danaBooking?.quote_id}`);
  await expect(page.getByRole("heading", { name: /not found/i }).first()).toBeVisible();
  await page.goto(`/bookings/${danaBooking?.id}`);
  await expect(page.getByRole("heading", { name: "Booking not found" })).toBeVisible();
  const lookedUp = await page.locator("body").innerText();
  expect(lookedUp).not.toContain("Dana");

  // Priya (a mechanic) probes a job she was never matched to, and Dana's booking.
  const priya = await newSession();
  await oneClickLogin(priya.page, "priya");
  await priya.page.goto(`/mechanic/jobs/${unmatchedForPriya?.id}`);
  await expect(priya.page.getByRole("heading", { name: "Job not found" })).toBeVisible();
  await priya.page.goto(`/mechanic/bookings/${danaBooking?.id}`);
  await expect(priya.page.getByRole("heading", { name: "Booking not found" })).toBeVisible();
});

test("a matched mechanic sees the job without contact details or address; request videos and private files stay hidden", async ({
  newSession,
  request,
}) => {
  test.setTimeout(600_000);
  const tag = runTag();
  const marcoId = userIdByEmail("mechanic@example.com");
  const customer = await newSession({ uniqueIp: true });
  const email = testEmail("e2e.private", tag);
  const phone = "480-555-0191";
  const street = `4821 E Quiet Willow Ln ${tag}`;
  const notes = `Gate code 7314, blue garage door ${tag}`;
  await signUp(customer.page, { role: "customer", displayName: `Private ${tag}`, email, password: "a-strong-password-1" });
  const requestId = await submitRequest(customer.page, {
    zip: "85281",
    streetAddress: street,
    city: "Tempe",
    locationNotes: notes,
    year: "2016",
    make: "Honda",
    model: `Accord ${tag}`,
    mileage: "99000",
    categoryId: "oil_change",
    description: `Oil change, the low-oil light flickers on hard stops. Ref ${tag}.`,
    drivable: "yes",
    photos: [await makeJpeg(`oil-light-${tag}.jpg`)],
    video: makeMp4(`noise-${tag}.mp4`),
    preferredDate: nextWeekday(3),
    window: "morning",
    serviceMode: "mobile",
    phone,
  });
  expect(dbGet("SELECT 1 FROM job_matches WHERE request_id = ? AND mechanic_id = ?", requestId, marcoId)).toBeTruthy();
  const media = dbAll<{ file_id: string; kind: string; shareable_before_booking: number }>(
    "SELECT file_id, kind, shareable_before_booking FROM request_media WHERE request_id = ? ORDER BY kind",
    requestId,
  );
  const photoId = media.find((item) => item.kind === "photo")?.file_id;
  const videoId = media.find((item) => item.kind === "video")?.file_id;
  expect(photoId && videoId, "the request should store one photo and one video").toBeTruthy();
  expect(media.find((item) => item.kind === "video")?.shareable_before_booking).toBe(0);

  // The owner can open both files.
  expect((await customer.page.request.get(`/api/files/${photoId}`)).status()).toBe(200);
  const ownVideo = await customer.page.request.get(`/api/files/${videoId}`);
  expect(ownVideo.status()).toBe(200);
  expect(ownVideo.headers()["cache-control"]).toContain("no-store");

  // The matched mechanic sees the coarse job and the shared photo, nothing private.
  const marco = await newSession();
  await oneClickLogin(marco.page, "marco");
  await marco.page.goto(`/mechanic/jobs/${requestId}`);
  await expect(marco.page.getByRole("heading", { name: `2016 Honda Accord ${tag}`, level: 1 })).toBeVisible();
  await expect(marco.page.getByText("Tempe, AZ 85281").first()).toBeVisible();
  await expect(marco.page.locator(`img[src^="/api/files/${photoId}"]`).first()).toBeAttached();
  const html = await marco.page.content();
  const text = await marco.page.locator("body").innerText();
  for (const content of [html, text]) {
    expect(content).not.toMatch(phonePattern(phone));
    expect(content).not.toContain(email);
    expect(content).not.toContain(street);
    expect(content).not.toContain("Quiet Willow");
    expect(content).not.toContain(notes);
    expect(content).not.toContain(videoId ?? "<missing>");
  }
  expect((await marco.page.request.get(`/api/files/${photoId}`)).status()).toBe(200);
  expect((await marco.page.request.get(`/api/files/${videoId}`)).status()).toBe(404);

  // Signed-out visitors get 404 for every private file, existing or not.
  for (const id of [photoId, videoId, "00000000-0000-4000-8000-000000000000"]) {
    const response = await request.get(`/api/files/${id}`);
    expect(response.status(), `signed-out GET /api/files/${id}`).toBe(404);
  }

  // A mechanic who was not matched cannot open the shared photo either.
  const sam = await newSession();
  await oneClickLogin(sam.page, "sam");
  expect((await sam.page.request.get(`/api/files/${photoId}`)).status()).toBe(404);
});

test("Luis and unrelated mechanics cannot fetch Dana's profile picture or booking photos", async ({ page, newSession }) => {
  test.setTimeout(600_000);
  const danaId = userIdByEmail("customer@example.com");
  const avatar = dbGet<{ avatar_file_id: string | null }>("SELECT avatar_file_id FROM users WHERE id = ?", danaId)?.avatar_file_id;
  const bookingPhotos = dbAll<{ file_id: string; mechanic_id: string }>(
    `SELECT p.file_id, b.mechanic_id FROM booking_photos p JOIN bookings b ON b.id = p.booking_id
      WHERE b.customer_id = ? ORDER BY p.created_at LIMIT 4`,
    danaId,
  );
  expect(avatar, "Dana has a profile picture in the sample data").toBeTruthy();
  expect(bookingPhotos.length, "Dana's bookings have photos in the sample data").toBeGreaterThan(0);

  await oneClickLogin(page, "dana");
  expect((await page.request.get(`/api/files/${avatar}`)).status()).toBe(200);
  expect((await page.request.get(`/api/files/${bookingPhotos[0].file_id}`)).status()).toBe(200);

  const luis = await newSession();
  await oneClickLogin(luis.page, "luis");
  expect((await luis.page.request.get(`/api/files/${avatar}`)).status()).toBe(404);
  for (const photo of bookingPhotos) {
    expect((await luis.page.request.get(`/api/files/${photo.file_id}`)).status(), `Luis GET booking photo ${photo.file_id}`).toBe(404);
  }

  // Priya is not the mechanic on any of these bookings.
  const priyaId = userIdByEmail("mechanic2@example.com");
  const notPriyas = bookingPhotos.filter((photo) => photo.mechanic_id !== priyaId);
  expect(notPriyas.length).toBeGreaterThan(0);
  const priya = await newSession();
  await oneClickLogin(priya.page, "priya");
  expect((await priya.page.request.get(`/api/files/${avatar}`)).status()).toBe(404);
  for (const photo of notPriyas) {
    expect((await priya.page.request.get(`/api/files/${photo.file_id}`)).status()).toBe(404);
  }
});
