import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UploadPurpose } from "@/server/config";
import { writeTx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import {
  assertUploadCount,
  filesFromFormData,
  jpegMetadataMarkers,
  prepareUpload,
  sanitizeOriginalName,
  saveFile,
  sniffFileType,
  type PreparedUpload,
} from "@/server/storage/uploads";
import { createTestContext, type TestContext } from "../support/db";
import { createUser } from "../support/factories";

// ---------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------

const MiB = 1024 * 1024;
const ALL_PURPOSES: readonly UploadPurpose[] = [
  "request_photo",
  "request_video",
  "mechanic_profile_photo",
  "mechanic_document",
  "user_avatar",
  "mechanic_gallery",
  "booking_photo",
];

/** The pictures people add themselves (docs/MEDIA.md). */
const PICTURE_PURPOSES = ["user_avatar", "mechanic_gallery", "booking_photo"] as const;

/** A real 80x40 JPEG with EXIF (camera make, GPS position), orientation 6 and an ICC profile. */
function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 80, height: 40, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "WrenchMatchTestCam", Model: "Privacy Probe" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "33/1 27/1 3/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "112/1 4/1 9/1",
        GPSMapDatum: "WGS-84",
      },
    })
    .toBuffer();
}

function pngWithAlpha(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } } })
    .png()
    .toBuffer();
}

function webp(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 20, channels: 3, background: "#22aa44" } }).webp().toBuffer();
}

/** An ISO base media file header ("ftyp" box) with the given brands. */
function isoMedia(major: string, compatible: readonly string[]): Buffer {
  const size = 16 + compatible.length * 4;
  const file = Buffer.alloc(size + 64);
  file.writeUInt32BE(size, 0);
  file.write("ftyp", 4, "latin1");
  file.write(major, 8, "latin1");
  compatible.forEach((brand, index) => file.write(brand, 16 + index * 4, "latin1"));
  return file;
}

/** An EBML (WebM/Matroska) header with the given DocType. */
function ebml(docType: "webm" | "matroska"): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x80 + docType.length]),
    Buffer.from(docType, "latin1"),
    Buffer.alloc(64),
  ]);
}

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
const HEIC = isoMedia("heic", ["mif1", "heic"]);
const MP4 = isoMedia("isom", ["isom", "iso2", "avc1", "mp41"]);
const MOV = isoMedia("qt  ", ["qt  "]);
const WEBM = ebml("webm");

/** A PNG whose header claims width x height pixels, with almost no image data. */
function pngHeaderOnly(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function input(bytes: Uint8Array, name: string) {
  return { bytes, name, size: bytes.byteLength };
}

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("invalid_input");
    return error as DomainError;
  }
  throw new Error("expected prepareUpload to reject");
}

let jpeg: Buffer;

beforeAll(async () => {
  jpeg = await jpegWithGps();
});

// ---------------------------------------------------------------------------------
// Sanitizing images
// ---------------------------------------------------------------------------------

describe("prepareUpload: images", () => {
  it("removes EXIF, GPS and ICC metadata from a real phone-style JPEG and applies its orientation", async () => {
    const before = await sharp(jpeg).metadata();
    expect(before.exif?.includes(Buffer.from("WrenchMatchTestCam"))).toBe(true);
    expect(before.exif?.includes(Buffer.from("WGS-84"))).toBe(true);
    expect(before.icc).toBeDefined();
    expect(before.orientation).toBe(6);

    const prepared = await prepareUpload(input(jpeg, "IMG_0042.jpg"), "request_photo");
    expect(prepared).toMatchObject({ mimeType: "image/jpeg", extension: "jpg", metadataStripped: true });
    // Orientation 6 means "rotate 90°": the stored pixels are upright and the tag is gone.
    expect([prepared.width, prepared.height]).toEqual([40, 80]);

    const after = await sharp(prepared.buffer).metadata();
    expect(after).toMatchObject({ format: "jpeg", width: 40, height: 80 });
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(jpegMetadataMarkers(prepared.buffer)).toEqual([]);
    for (const leaked of ["WrenchMatchTestCam", "Privacy Probe", "WGS-84", "Exif"]) {
      expect(prepared.buffer.includes(Buffer.from(leaked)), leaked).toBe(false);
    }
    expect(prepared.sha256).toBe(createHash("sha256").update(prepared.buffer).digest("hex"));
  });

  it("re-encodes PNG and WebP as JPEG, flattening transparency onto white", async () => {
    const fromPng = await prepareUpload(input(await pngWithAlpha(64, 32), "diagram.png"), "request_photo");
    const pngMeta = await sharp(fromPng.buffer).metadata();
    expect(pngMeta).toMatchObject({ format: "jpeg", hasAlpha: false, channels: 3 });

    const fromWebp = await prepareUpload(input(await webp(), "dash.webp"), "request_photo");
    expect(fromWebp).toMatchObject({ mimeType: "image/jpeg", width: 30, height: 20, metadataStripped: true });
  });

  it("resizes to at most 2048 px for request photos and documents and 512 px for profile photos", async () => {
    const wide = await pngWithAlpha(3000, 1000);
    const photo = await prepareUpload(input(wide, "wide.png"), "request_photo");
    expect([photo.width, photo.height]).toEqual([2048, 683]);
    const document = await prepareUpload(input(wide, "insurance.png"), "mechanic_document");
    expect([document.width, document.height]).toEqual([2048, 683]);
    const profile = await prepareUpload(input(wide, "me.png"), "mechanic_profile_photo");
    expect([profile.width, profile.height]).toEqual([512, 171]);
    const small = await prepareUpload(input(await webp(), "small.webp"), "mechanic_profile_photo");
    expect([small.width, small.height]).toEqual([30, 20]); // never enlarged
  });

  it("strips metadata from profile pictures, gallery and booking photos and resizes them (512 / 1600 / 1600 px)", async () => {
    const expectedLongSide = { user_avatar: 512, mechanic_gallery: 1600, booking_photo: 1600 } as const;
    const big = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 90, b: 200 } } })
      .jpeg()
      .withMetadata({ orientation: 1 })
      .withExif({ IFD0: { Make: "WrenchMatchTestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 27/1 3/1" } })
      .toBuffer();
    for (const purpose of PICTURE_PURPOSES) {
      const prepared = await prepareUpload(input(big, "IMG_0099.jpg"), purpose);
      expect(prepared, purpose).toMatchObject({ mimeType: "image/jpeg", extension: "jpg", metadataStripped: true });
      expect(Math.max(prepared.width ?? 0, prepared.height ?? 0), purpose).toBe(expectedLongSide[purpose]);
      const after = await sharp(prepared.buffer).metadata();
      expect(after.exif, purpose).toBeUndefined();
      expect(prepared.buffer.includes(Buffer.from("WrenchMatchTestCam")), purpose).toBe(false);
      expect(jpegMetadataMarkers(prepared.buffer), purpose).toEqual([]);
    }
    const fromPng = await prepareUpload(input(await pngWithAlpha(64, 32), "avatar.png"), "user_avatar");
    expect(fromPng).toMatchObject({ mimeType: "image/jpeg", width: 64, height: 32 });
  });

  it("refuses HEIC, PDFs and videos as pictures, with messages that name the picture kind", async () => {
    for (const purpose of PICTURE_PURPOSES) {
      expect((await rejection(prepareUpload(input(HEIC, "IMG_0042.jpg"), purpose))).details).toMatchObject({ reason: "heic" });
      expect((await rejection(prepareUpload(input(PDF, "scan.pdf"), purpose))).details).toMatchObject({ reason: "unsupported_type" });
      expect((await rejection(prepareUpload(input(MP4, "clip.mp4"), purpose))).details).toMatchObject({ reason: "unsupported_type" });
    }
    expect((await rejection(prepareUpload(input(PDF, "scan.pdf"), "user_avatar"))).userMessage).toBe(
      "“scan.pdf” is a PDF. Profile pictures must be JPEG, PNG or WebP.",
    );
    expect((await rejection(prepareUpload(input(PDF, "scan.pdf"), "mechanic_gallery"))).userMessage).toBe(
      "“scan.pdf” is a PDF. Gallery photos must be JPEG, PNG or WebP.",
    );
  });

  it("rejects damaged images and images with too many pixels before decoding them", async () => {
    const truncated = await rejection(prepareUpload(input(jpeg.subarray(0, 200), "cut.jpg"), "request_photo"));
    expect(truncated.userMessage).toBe("“cut.jpg” couldn't be read as an image. It may be damaged; try exporting it again.");

    const bomb = await rejection(prepareUpload(input(pngHeaderOnly(20_000, 20_000), "huge.png"), "request_photo"));
    expect(bomb.userMessage).toBe("“huge.png” is too large to process (over 50 megapixels). Resize it and try again.");
  });
});

// ---------------------------------------------------------------------------------
// Size and type rules
// ---------------------------------------------------------------------------------

describe("prepareUpload: size limits", () => {
  it("rejects files over the purpose's limit, checking the real byte count", async () => {
    const overPhotoLimit = Buffer.alloc(8 * MiB + 1);
    jpeg.copy(overPhotoLimit, 0, 0, 64);
    const photo = await rejection(prepareUpload(input(overPhotoLimit, "big.jpg"), "request_photo"));
    expect(photo.userMessage).toBe("“big.jpg” is too large. Photos can be up to 8 MB each.");

    const profile = await rejection(prepareUpload(input(Buffer.alloc(5 * MiB + 1, 1), "me.jpg"), "mechanic_profile_photo"));
    expect(profile.userMessage).toBe("“me.jpg” is too large. Profile photos can be up to 5 MB.");

    const overVideoLimit = Buffer.alloc(40 * MiB + 1);
    MP4.copy(overVideoLimit);
    const video = await rejection(prepareUpload(input(overVideoLimit, "long.mp4"), "request_video"));
    expect(video.userMessage).toBe("“long.mp4” is too large. Videos can be up to 40 MB.");

    for (const [purpose, noun] of [["user_avatar", "Profile pictures can be up to 8 MB."], ["mechanic_gallery", "Gallery photos can be up to 8 MB each."], ["booking_photo", "Photos can be up to 8 MB each."]] as const) {
      const picture = await rejection(prepareUpload(input(overPhotoLimit, "big.jpg"), purpose));
      expect(picture.userMessage, purpose).toBe(`“big.jpg” is too large. ${noun}`);
    }

    // A browser-reported size over the limit is refused too.
    const lied = await rejection(prepareUpload({ bytes: jpeg, name: "odd.jpg", size: 9 * MiB }, "request_photo"));
    expect(lied.details).toMatchObject({ reason: "too_large" });
  });

  it("rejects empty files", async () => {
    const empty = await rejection(prepareUpload(input(new Uint8Array(0), "empty.jpg"), "request_photo"));
    expect(empty.userMessage).toBe("“empty.jpg” is empty. Choose the file again.");
  });
});

describe("prepareUpload: types come from the bytes, not the file name", () => {
  it("rejects a spoofed extension", async () => {
    const text = Buffer.from("just some text pretending to be a photo", "utf8");
    const notImage = await rejection(prepareUpload(input(text, "photo.jpg"), "request_photo"));
    expect(notImage.userMessage).toBe("“photo.jpg” isn't a file type we can use. Photos must be JPEG, PNG or WebP.");

    const pdfAsJpeg = await rejection(prepareUpload(input(PDF, "photo.jpg"), "request_photo"));
    expect(pdfAsJpeg.userMessage).toBe("“photo.jpg” is a PDF. Photos must be JPEG, PNG or WebP.");

    const webpAsVideo = await rejection(prepareUpload(input(await webp(), "clip.mp4"), "request_video"));
    expect(webpAsVideo.userMessage).toBe("“clip.mp4” is a WebP image. Videos must be MP4, MOV or WebM.");

    // A real image with a misleading name is accepted for what it is.
    const imageAsPdf = await prepareUpload(input(jpeg, "scan.pdf"), "mechanic_document");
    expect(imageAsPdf.mimeType).toBe("image/jpeg");
  });

  it("rejects HEIC photos with a 'please export as JPEG' message", async () => {
    for (const purpose of ["request_photo", "mechanic_profile_photo", "mechanic_document"] as const) {
      const error = await rejection(prepareUpload(input(HEIC, "IMG_0042.jpg"), purpose));
      expect(error.userMessage).toBe(
        "“IMG_0042.jpg” is a HEIC photo. HEIC photos aren't supported yet - please export as JPEG.",
      );
      expect(error.details).toMatchObject({ reason: "heic" });
    }
    const asVideo = await rejection(prepareUpload(input(HEIC, "IMG_0042.HEIC"), "request_video"));
    expect(asVideo.userMessage).toBe("“IMG_0042.HEIC” is a HEIC photo. Videos must be MP4, MOV or WebM.");
  });

  it("accepts PDFs for mechanic documents only, stored as uploaded", async () => {
    const prepared = await prepareUpload(input(PDF, "insurance-certificate.pdf"), "mechanic_document");
    expect(prepared).toMatchObject({ mimeType: "application/pdf", extension: "pdf", metadataStripped: false });
    expect(prepared.buffer.equals(PDF)).toBe(true);
    expect(prepared.sha256).toBe(createHash("sha256").update(PDF).digest("hex"));

    for (const purpose of ["request_photo", "request_video", "mechanic_profile_photo"] as const) {
      const error = await rejection(prepareUpload(input(PDF, "insurance-certificate.pdf"), purpose));
      expect(error.userMessage).toMatch(/^“insurance-certificate\.pdf” is a PDF\. /);
    }
  });

  it("accepts MP4, MOV and WebM for the request video only, stored as uploaded", async () => {
    const videos: ReadonlyArray<[Buffer, string, PreparedUpload["mimeType"], PreparedUpload["extension"]]> = [
      [MP4, "noise.mp4", "video/mp4", "mp4"],
      [MOV, "noise.MOV", "video/quicktime", "mov"],
      [WEBM, "noise.webm", "video/webm", "webm"],
    ];
    for (const [bytes, name, mimeType, extension] of videos) {
      const prepared = await prepareUpload(input(bytes, name), "request_video");
      expect(prepared).toMatchObject({ mimeType, extension, metadataStripped: false });
      expect(prepared.buffer.equals(bytes)).toBe(true);
      expect(prepared.width).toBeUndefined();

      for (const purpose of ALL_PURPOSES.filter((other) => other !== "request_video")) {
        const error = await rejection(prepareUpload(input(bytes, name), purpose));
        expect(error.userMessage).toMatch(/ is a video\. /);
      }
    }
  });

  it("names recognised but unsupported formats", async () => {
    const cases: ReadonlyArray<[Buffer, string]> = [
      [isoMedia("avif", ["avif", "mif1", "miaf"]), "an AVIF image"],
      [isoMedia("mif1", ["avif", "mif1"]), "an AVIF image"],
      [isoMedia("M4A ", ["M4A ", "mp42", "isom"]), "an audio file"],
      [ebml("matroska"), "an MKV video"],
      [Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"), "a GIF image"],
      [Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', "utf8"), "an SVG image"],
    ];
    for (const [bytes, label] of cases) {
      const error = await rejection(prepareUpload(input(bytes, "file.bin"), "request_photo"));
      expect(error.userMessage).toBe(`“file.bin” is ${label}. Photos must be JPEG, PNG or WebP.`);
    }
  });
});

describe("sniffFileType", () => {
  it("recognises each accepted format by its magic bytes", async () => {
    expect(sniffFileType(jpeg)).toEqual({ kind: "image", mimeType: "image/jpeg" });
    expect(sniffFileType(await pngWithAlpha(2, 2))).toEqual({ kind: "image", mimeType: "image/png" });
    expect(sniffFileType(await webp())).toEqual({ kind: "image", mimeType: "image/webp" });
    expect(sniffFileType(PDF)).toEqual({ kind: "pdf", mimeType: "application/pdf" });
    expect(sniffFileType(MP4)).toEqual({ kind: "video", mimeType: "video/mp4" });
    expect(sniffFileType(isoMedia("mp42", ["mp42", "isom"]))).toEqual({ kind: "video", mimeType: "video/mp4" });
    expect(sniffFileType(MOV)).toEqual({ kind: "video", mimeType: "video/quicktime" });
    expect(sniffFileType(WEBM)).toEqual({ kind: "video", mimeType: "video/webm" });
    expect(sniffFileType(HEIC)).toEqual({ kind: "heic" });
    expect(sniffFileType(isoMedia("msf1", ["msf1", "hevc"]))).toEqual({ kind: "heic" });
    expect(sniffFileType(new Uint8Array([1, 2, 3]))).toEqual({ kind: "other", label: null });
  });
});

// ---------------------------------------------------------------------------------
// Names, counts and form helpers
// ---------------------------------------------------------------------------------

describe("sanitizeOriginalName", () => {
  it("keeps only a safe, readable base name", () => {
    expect(sanitizeOriginalName("C:\\Users\\dana\\Pictures\\brake noise.jpg")).toBe("brake noise.jpg");
    expect(sanitizeOriginalName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeOriginalName("  multiple   spaces\t\n.jpg  ")).toBe("multiple spaces.jpg");
    // A right-to-left override could display "photo\u202Egpj.exe" as "photoexe.jpg".
    expect(sanitizeOriginalName("photo\u202Egpj.exe")).toBe("photogpj.exe");
    expect(sanitizeOriginalName("zero\u200Bwidth\u0000.png")).toBe("zerowidth.png");
    expect(sanitizeOriginalName("")).toBeNull();
    expect(sanitizeOriginalName("..")).toBeNull();
    expect(sanitizeOriginalName("dir/")).toBeNull();
    expect(sanitizeOriginalName(null)).toBeNull();
  });

  it("caps the length at 120 characters, keeping the extension", () => {
    const long = sanitizeOriginalName(`${"a".repeat(300)}.jpeg`);
    expect(long).toHaveLength(120);
    expect(long?.endsWith("….jpeg")).toBe(true);
  });
});

describe("assertUploadCount and filesFromFormData", () => {
  it("enforces the per-purpose file counts", () => {
    expect(() => assertUploadCount("request_photo", 5)).not.toThrow();
    expect(() => assertUploadCount("request_photo", 6)).toThrow("Add up to 5 photos.");
    expect(() => assertUploadCount("request_video", 2)).toThrow("Add up to 1 video.");
  });

  it("skips the empty placeholder a blank file input submits", () => {
    const form = new FormData();
    form.append("photos", new File([], ""));
    form.append("photos", new File([new Uint8Array(jpeg)], "one.jpg", { type: "image/jpeg" }));
    form.append("photos", "not a file");
    expect(filesFromFormData(form, "photos").map((file) => file.name)).toEqual(["one.jpg"]);
  });
});

// ---------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------

describe("saveFile", () => {
  let t: TestContext;

  beforeAll(() => {
    t = createTestContext();
  });

  afterAll(async () => {
    await t.cleanup();
  });

  const storedFiles = () =>
    fs.existsSync(path.join(t.dir, "uploads"))
      ? fs.readdirSync(path.join(t.dir, "uploads"), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
      : [];

  it("stores the bytes under a generated key and records the files row", async () => {
    const owner = await createUser(t.ctx, { role: "customer" });
    const prepared = await prepareUpload(input(jpeg, "brake.jpg"), "request_photo");
    const saved = await writeTx(t.ctx.db, (trx) =>
      saveFile(trx, t.ctx, owner.id, prepared, "request_photo", "C:\\fakepath\\brake\u0000 noise.jpg"),
    );

    expect(saved.storageKey).toBe(`request-photos/2026/${saved.id}.jpg`);
    expect((await t.ctx.storage.read(saved.storageKey)).equals(prepared.buffer)).toBe(true);
    const row = t.sqlite.prepare("SELECT * FROM files WHERE id = ?").get(saved.id);
    expect(row).toMatchObject({
      owner_user_id: owner.id,
      purpose: "request_photo",
      storage_key: saved.storageKey,
      mime_type: "image/jpeg",
      size_bytes: prepared.buffer.byteLength,
      width: 40,
      height: 80,
      sha256: prepared.sha256,
      metadata_stripped: 1,
      original_name: "brake noise.jpg",
      created_at: t.ctx.now.toISOString(),
    });
  });

  it("removes the stored bytes when the files row cannot be inserted", async () => {
    const before = storedFiles().length;
    const prepared = await prepareUpload(input(PDF, "id.pdf"), "mechanic_document");
    await expect(
      writeTx(t.ctx.db, (trx) => saveFile(trx, t.ctx, "no-such-user", prepared, "mechanic_document", "id.pdf")),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(storedFiles()).toHaveLength(before);
  });
});
