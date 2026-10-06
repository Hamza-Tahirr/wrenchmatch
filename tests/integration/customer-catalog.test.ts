// Reference data for the request form (categories, pilot ZIPs, form options) and the
// preparation of uploaded photos/videos from the form's FormData.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONSENT_VERSION, REQUEST_CONSENTS, VEHICLE_MAKES } from "@/lib/domain";
import { listEnabledCategories } from "@/server/catalog/categories";
import { lookupPilotZip } from "@/server/catalog/pilot-zips";
import { getRequestFormOptions } from "@/server/catalog/request-form";
import { prepareRequestUploads } from "@/server/customer/request-uploads";
import { createTestContext, type TestContext } from "../support/db";
import { createZip, TEST_ZIPS } from "../support/factories";

let t: TestContext;

beforeEach(async () => {
  t = createTestContext();
  await createZip(t.ctx, { zip: "85004", ...TEST_ZIPS["85004"], metroLabel: "Phoenix metro" });
  await createZip(t.ctx, { zip: "85281", ...TEST_ZIPS["85281"], metroLabel: "Phoenix metro" });
  await createZip(t.ctx, { zip: "10001", ...TEST_ZIPS["10001"] }); // known, not in the pilot
});

afterEach(async () => {
  await t.cleanup();
});

describe("listEnabledCategories", () => {
  it("lists the enabled categories in display order with their notices", async () => {
    const categories = await listEnabledCategories(t.ctx);
    expect(categories).toHaveLength(12);
    expect(categories[0]).toEqual({
      id: "diagnostic_visit",
      name: "Diagnostic visit",
      shortDescription: expect.stringContaining("inspects the vehicle"),
      customerNotice: null,
      safetySensitive: false,
    });
    expect(categories.find((category) => category.id === "cel_code_read")?.customerNotice).toMatch(/not a full diagnosis/);
    expect(categories.filter((category) => category.safetySensitive).map((category) => category.id)).toEqual([
      "brake_work",
      "suspension_work",
    ]);

    t.sqlite.prepare("UPDATE service_categories SET enabled = 0 WHERE id = 'wipers'").run();
    expect((await listEnabledCategories(t.ctx)).map((category) => category.id)).not.toContain("wipers");
  });
});

describe("lookupPilotZip", () => {
  it("accepts enabled pilot ZIPs (also as ZIP+4) and explains the others", async () => {
    expect(await lookupPilotZip(t.ctx, "85281")).toEqual({
      status: "ok",
      zip: "85281",
      city: "Tempe",
      state: "AZ",
      areaLabel: "Tempe, AZ 85281",
      metroLabel: "Phoenix metro",
      timeZone: "America/Phoenix",
    });
    expect(await lookupPilotZip(t.ctx, " 85004-1234 ")).toMatchObject({ status: "ok", zip: "85004" });
    expect(await lookupPilotZip(t.ctx, "99999")).toEqual({ status: "unknown_zip", zip: "99999" });
    expect(await lookupPilotZip(t.ctx, "abc")).toEqual({ status: "unknown_zip", zip: "abc" });
    expect(await lookupPilotZip(t.ctx, "10001")).toEqual({ status: "not_in_pilot", zip: "10001" });

    t.sqlite.prepare("UPDATE pilot_zips SET enabled = 0 WHERE zip = '85281'").run();
    expect(await lookupPilotZip(t.ctx, "85281")).toEqual({ status: "not_in_pilot", zip: "85281" });
  });
});

describe("getRequestFormOptions", () => {
  it("leaves disabled pilot ZIPs out of the coverage preview", async () => {
    t.sqlite.prepare("UPDATE pilot_zips SET enabled = 0 WHERE zip = '85281'").run();
    const options = await getRequestFormOptions(t.ctx);
    expect(options.coverage.zips.map((point) => point.zip)).toEqual(["85004"]);
    expect(options.coverage.metros).toMatchObject([{ metroLabel: "Phoenix metro", zipCount: 1 }]);
  });

  it("bundles everything the request form renders", async () => {
    const options = await getRequestFormOptions(t.ctx);

    expect(options.categories).toHaveLength(12);
    // Each category says what helps mechanics quote it (MVP_PLAN section 4).
    for (const category of options.categories) expect(category.quoteHint.length, category.id).toBeGreaterThan(40);
    expect(options.categories.find((category) => category.id === "battery_replacement")?.quoteHint).toMatch(/group number/);
    expect(new Set(options.categories.map((category) => category.quoteHint)).size).toBe(12);
    expect(options.makes).toEqual(VEHICLE_MAKES);
    expect(options.windows.map((window) => window.value)).toEqual(["morning", "afternoon", "evening", "flexible"]);
    expect(options.windows[0]).toEqual({ value: "morning", label: "Morning", hours: "8 AM–12 PM" });
    expect(options.serviceModes.map((mode) => mode.value)).toEqual(["mobile", "garage", "either"]);
    expect(options.garageDistances).toEqual({ options: [5, 10, 15, 25], defaultMiles: 15 });
    expect(options.consents).toEqual({ version: CONSENT_VERSION, items: REQUEST_CONSENTS });
    expect(options.pilotAreas).toEqual([
      {
        metroLabel: "Phoenix metro",
        zips: [
          { zip: "85004", city: "Phoenix", state: "AZ" },
          { zip: "85281", city: "Tempe", state: "AZ" },
        ],
        timeZones: ["America/Phoenix"],
      },
    ]);
    // Enabled pilot ZIP centroids only (approximate points for the coverage preview map).
    expect(options.coverage.zips).toEqual([
      {
        zip: "85004",
        city: "Phoenix",
        state: "AZ",
        areaLabel: "Phoenix, AZ 85004",
        metroLabel: "Phoenix metro",
        lat: 33.451,
        lng: -112.069,
      },
      {
        zip: "85281",
        city: "Tempe",
        state: "AZ",
        areaLabel: "Tempe, AZ 85281",
        metroLabel: "Phoenix metro",
        lat: 33.428,
        lng: -111.933,
      },
    ]);
    expect(options.vehicleYears).toEqual({ min: 1960, max: 2027 });
    expect(options.preferredDate).toEqual({ min: "2026-10-05", max: "2026-12-04" });
    expect(options.uploads.photos).toMatchObject({
      field: "photos",
      maxFiles: 5,
      maxFileSizeBytes: 8 * 1024 * 1024,
      accept: "image/jpeg,image/png,image/webp",
      limitLabel: "Up to 5 photos, 8 MB each",
    });
    expect(options.uploads.video).toMatchObject({ field: "video", maxFiles: 1, limitLabel: "One short video, up to 40 MB" });
  });
});

describe("prepareRequestUploads", () => {
  async function jpegFile(name: string): Promise<File> {
    const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withExif({ IFD0: { Make: "Probe" } })
      .toBuffer();
    return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
  }

  function mp4File(name: string): File {
    const bytes = Buffer.alloc(96);
    bytes.writeUInt32BE(24, 0);
    bytes.write("ftypisom", 4, "latin1");
    bytes.write("isomavc1", 16, "latin1");
    return new File([new Uint8Array(bytes)], name, { type: "video/mp4" });
  }

  it("prepares photos (metadata stripped) and the video, skipping empty file inputs", async () => {
    const form = new FormData();
    form.append("photos", await jpegFile("front.jpg"));
    form.append("photos", await jpegFile("side.jpg"));
    form.append("photos", new File([], "", { type: "application/octet-stream" }));
    form.append("video", mp4File("noise.mp4"));

    const result = await prepareRequestUploads(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uploads.photos.map((photo) => [photo.originalName, photo.prepared.mimeType, photo.prepared.metadataStripped])).toEqual([
      ["front.jpg", "image/jpeg", true],
      ["side.jpg", "image/jpeg", true],
    ]);
    expect(result.uploads.videos.map((video) => [video.originalName, video.prepared.mimeType])).toEqual([
      ["noise.mp4", "video/mp4"],
    ]);
  });

  it("names each rejected file and refuses too many files before decoding any", async () => {
    const heic = Buffer.alloc(64);
    heic.writeUInt32BE(24, 0);
    heic.write("ftypheic", 4, "latin1");
    heic.write("mif1heic", 16, "latin1");
    const form = new FormData();
    form.append("photos", new File([new Uint8Array(heic)], "IMG_0001.HEIC"));
    form.append("video", await jpegFile("not-a-video.jpg"));
    const rejected = await prepareRequestUploads(form);
    expect(rejected).toEqual({
      ok: false,
      fieldErrors: {
        photos: ["“IMG_0001.HEIC” is a HEIC photo. HEIC photos aren't supported yet - please export as JPEG."],
        video: ["“not-a-video.jpg” is a JPEG image. Videos must be MP4, MOV or WebM."],
      },
    });

    const tooMany = new FormData();
    for (let index = 0; index < 6; index += 1) tooMany.append("photos", new File([new Uint8Array([1, 2, 3])], `p${index}.jpg`));
    expect(await prepareRequestUploads(tooMany)).toEqual({
      ok: false,
      fieldErrors: { photos: ["Add up to 5 photos (you chose 6)."] },
    });
  });
});
