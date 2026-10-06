import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { formatBytes } from "@/lib/format";
import { UPLOAD_LIMITS, type UploadPurpose } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { newId } from "@/server/ids";

import { HOSTED_UPLOAD_MAX_BYTES } from "./config";

// Upload validation and sanitizing (ARCHITECTURE section 9). The file type comes from the
// file's own bytes (magic numbers), never from its name or the browser's MIME type.
// Images are decoded and re-encoded as JPEG with every metadata block removed (EXIF, GPS,
// ICC, XMP, IPTC); videos and PDFs are stored as uploaded.

export type UploadInput = {
  bytes: Uint8Array;
  /** The name the browser sent; used only for messages and as files.original_name. */
  name: string;
  /** The size the browser reported (File.size). The actual byte length is checked too. */
  size: number;
};

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
type VideoMimeType = "video/mp4" | "video/quicktime" | "video/webm";

export type StoredMimeType = "image/jpeg" | VideoMimeType | "application/pdf";
export type StoredExtension = "jpg" | "mp4" | "mov" | "webm" | "pdf";

export type PreparedUpload = {
  /** The bytes to store: a re-encoded JPEG for images, the original bytes otherwise. */
  buffer: Buffer;
  mimeType: StoredMimeType;
  extension: StoredExtension;
  /** Pixel size of a stored image. */
  width?: number;
  height?: number;
  /** Hex SHA-256 of `buffer`. */
  sha256: string;
  /** True for images (all metadata removed); false for videos and PDFs, stored as-is. */
  metadataStripped: boolean;
};

export type SniffedType =
  | { kind: "image"; mimeType: ImageMimeType }
  | { kind: "video"; mimeType: VideoMimeType }
  | { kind: "pdf"; mimeType: "application/pdf" }
  | { kind: "heic" }
  /** Anything else; `label` names a recognised but unsupported format ("a GIF image"). */
  | { kind: "other"; label: string | null };

/** Images with more pixels than this are refused before decoding (decompression bombs). */
export const MAX_IMAGE_PIXELS = 50_000_000;
const JPEG_QUALITY = 82;
const PROCESSING_TIMEOUT_SECONDS = 30;
const MAX_ORIGINAL_NAME_LENGTH = 120;
const MAX_NAME_IN_MESSAGES = 60;

const PURPOSE_COPY: Record<UploadPurpose, { noun: string; types: string; each: boolean }> = {
  request_photo: { noun: "Photos", types: "JPEG, PNG or WebP", each: true },
  request_video: { noun: "Videos", types: "MP4, MOV or WebM", each: false },
  mechanic_profile_photo: { noun: "Profile photos", types: "JPEG, PNG or WebP", each: false },
  mechanic_document: { noun: "Documents", types: "PDF, JPEG, PNG or WebP", each: true },
  user_avatar: { noun: "Profile pictures", types: "JPEG, PNG or WebP", each: false },
  mechanic_gallery: { noun: "Gallery photos", types: "JPEG, PNG or WebP", each: true },
  booking_photo: { noun: "Photos", types: "JPEG, PNG or WebP", each: true },
};

/** Storage folders per purpose: keys look like "request-photos/2026/<file id>.jpg". */
const PURPOSE_DIRECTORIES: Record<UploadPurpose, string> = {
  request_photo: "request-photos",
  request_video: "request-videos",
  mechanic_profile_photo: "profile-photos",
  mechanic_document: "mechanic-documents",
  user_avatar: "avatars",
  mechanic_gallery: "gallery-photos",
  booking_photo: "booking-photos",
};

/** The top-level folders under UPLOAD_DIR that hold stored files; db:reset deletes only these. */
export const UPLOAD_FOLDERS: readonly string[] = Object.values(PURPOSE_DIRECTORIES);

// ---------------------------------------------------------------------------------
// Type sniffing
// ---------------------------------------------------------------------------------

function latin1(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let index = start; index < Math.min(bytes.length, start + length); index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

// ISO base media ("ftyp") brands. HEIF covers HEIC photos from phones.
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "heif", "mif1", "mif2", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
const AUDIO_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "F4A ", "F4B "]);
const QUICKTIME_BRAND = "qt  ";

function isMp4Brand(brand: string): boolean {
  return (
    /^(iso[2-9m]|isom|mp4[12]|mp71|avc1|3gp[4-9]|3g2[a-c]|M4V[ HP]|f4v |dash|mmp4|MSNV|XAVC)$/.test(brand)
  );
}

function sniffIsoMedia(bytes: Uint8Array): SniffedType {
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(bytes.length, boxSize >= 16 && boxSize <= 4096 ? boxSize : 64);
  const major = latin1(bytes, 8, 4);
  const compatible: string[] = [];
  for (let offset = 16; offset + 4 <= end; offset += 4) compatible.push(latin1(bytes, offset, 4));

  const avif: SniffedType = { kind: "other", label: "an AVIF image" };
  if (AVIF_BRANDS.has(major)) return avif;
  if (HEIF_BRANDS.has(major)) return compatible.some((brand) => AVIF_BRANDS.has(brand)) ? avif : { kind: "heic" };
  if (major === QUICKTIME_BRAND) return { kind: "video", mimeType: "video/quicktime" };
  if (AUDIO_BRANDS.has(major)) return { kind: "other", label: "an audio file" };
  if (isMp4Brand(major)) return { kind: "video", mimeType: "video/mp4" };
  if (compatible.some((brand) => AVIF_BRANDS.has(brand))) return avif;
  if (compatible.some((brand) => HEIF_BRANDS.has(brand))) return { kind: "heic" };
  if (compatible.includes(QUICKTIME_BRAND)) return { kind: "video", mimeType: "video/quicktime" };
  if (compatible.some(isMp4Brand)) return { kind: "video", mimeType: "video/mp4" };
  return { kind: "other", label: null };
}

function sniffEbml(bytes: Uint8Array): SniffedType {
  // The EBML header names its DocType near the start: "webm" or "matroska".
  const header = latin1(bytes, 0, 64);
  if (header.includes("webm")) return { kind: "video", mimeType: "video/webm" };
  if (header.includes("matroska")) return { kind: "other", label: "an MKV video" };
  return { kind: "other", label: null };
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const text = latin1(bytes, 0, 512).replace(/^ï»¿/, "").trimStart().toLowerCase();
  return text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"));
}

/** Identifies a file from its first bytes. */
export function sniffFileType(bytes: Uint8Array): SniffedType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mimeType: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mimeType: "image/png" };
  if (latin1(bytes, 0, 4) === "RIFF") {
    const form = latin1(bytes, 8, 4);
    if (form === "WEBP") return { kind: "image", mimeType: "image/webp" };
    if (form === "AVI ") return { kind: "other", label: "an AVI video" };
    if (form === "WAVE") return { kind: "other", label: "an audio file" };
  }
  if (latin1(bytes, 0, 5) === "%PDF-") return { kind: "pdf", mimeType: "application/pdf" };
  if (latin1(bytes, 4, 4) === "ftyp") return sniffIsoMedia(bytes);
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return sniffEbml(bytes);
  const head = latin1(bytes, 0, 6);
  if (head === "GIF87a" || head === "GIF89a") return { kind: "other", label: "a GIF image" };
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { kind: "other", label: "a TIFF image" };
  }
  if (looksLikeSvg(bytes)) return { kind: "other", label: "an SVG image" };
  return { kind: "other", label: null };
}

// ---------------------------------------------------------------------------------
// Names and messages
// ---------------------------------------------------------------------------------

// Control characters, plus invisible and bidirectional-override characters that can make
// a name display misleadingly (e.g. "photo‮gpj.exe" shown as "photoexe.jpg").
const UNSAFE_NAME_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

function truncateKeepingExtension(name: string, maxLength: number): string {
  const characters = Array.from(name);
  if (characters.length <= maxLength) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 11 ? name.slice(dot) : "";
  const keep = Math.max(1, maxLength - Array.from(extension).length - 1);
  return `${characters.slice(0, keep).join("").trimEnd()}…${extension}`;
}

/**
 * The browser-supplied file name reduced to a safe display name for files.original_name:
 * last path segment only, no control or invisible formatting characters, collapsed
 * whitespace, at most 120 characters (keeping the extension). Null when nothing is left.
 */
export function sanitizeOriginalName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.normalize("NFC").replace(UNSAFE_NAME_CHARACTERS, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return null;
  return truncateKeepingExtension(cleaned, MAX_ORIGINAL_NAME_LENGTH);
}

function subjectFor(name: string): string {
  const safe = sanitizeOriginalName(name);
  return safe ? `“${truncateKeepingExtension(safe, MAX_NAME_IN_MESSAGES)}”` : "This file";
}

function invalid(message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError("invalid_input", message, details);
}

const IMAGE_LABELS: Record<ImageMimeType, string> = {
  "image/jpeg": "a JPEG image",
  "image/png": "a PNG image",
  "image/webp": "a WebP image",
};

function describe(sniffed: SniffedType): string | null {
  switch (sniffed.kind) {
    case "image":
      return IMAGE_LABELS[sniffed.mimeType];
    case "video":
      return "a video";
    case "pdf":
      return "a PDF";
    case "heic":
      return "a HEIC photo";
    case "other":
      return sniffed.label;
  }
}

function wrongTypeError(subject: string, purpose: UploadPurpose, sniffed: SniffedType): DomainError {
  const { noun, types } = PURPOSE_COPY[purpose];
  const description = describe(sniffed);
  const opening = description ? `${subject} is ${description}.` : `${subject} isn't a file type we can use.`;
  return invalid(`${opening} ${noun} must be ${types}.`, { reason: "unsupported_type" });
}

function allows(purpose: UploadPurpose, mimeType: string): boolean {
  return (UPLOAD_LIMITS[purpose].mimeTypes as readonly string[]).includes(mimeType);
}

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// ---------------------------------------------------------------------------------
// Image sanitizing
// ---------------------------------------------------------------------------------

/** APPn (EXIF, XMP, ICC, IPTC...) and COM markers before the image data. */
export function jpegMetadataMarkers(jpeg: Uint8Array): number[] {
  const found: number[] = [];
  let offset = 2; // after SOI
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    const length = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) found.push(marker);
    offset += 2 + length;
  }
  return found;
}

// sharp writes no metadata unless asked (withMetadata/keepExif/keepIccProfile...). This
// double-checks the output before it is stored, and fails loudly if anything slipped in.
async function assertNoMetadata(jpeg: Buffer): Promise<void> {
  const metadata = await sharp(jpeg).metadata();
  const leftovers = [
    metadata.exif ? "EXIF" : null,
    metadata.xmp ? "XMP" : null,
    metadata.iptc ? "IPTC" : null,
    metadata.icc ? "ICC" : null,
    jpegMetadataMarkers(jpeg).length > 0 ? "APPn/COM segments" : null,
  ].filter((entry): entry is string => entry !== null);
  if (leftovers.length > 0) {
    throw new Error(`Image sanitizing left metadata in the output (${leftovers.join(", ")}); not storing it.`);
  }
}

async function sanitizeImage(source: Buffer, subject: string, maxDimensionPx: number): Promise<PreparedUpload> {
  let output: { data: Buffer; info: { width: number; height: number } };
  try {
    output = await sharp(source, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      // Abort on decoding errors (truncated or corrupt data); tolerate mere warnings,
      // which many genuine phone photos trigger.
      failOn: "error",
      sequentialRead: true,
    })
      .autoOrient()
      .resize({ width: maxDimensionPx, height: maxDimensionPx, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw invalid(
        `${subject} is too large to process (over ${MAX_IMAGE_PIXELS / 1_000_000} megapixels). Resize it and try again.`,
        { reason: "too_many_pixels" },
      );
    }
    throw invalid(`${subject} couldn't be read as an image. It may be damaged; try exporting it again.`, {
      reason: "unreadable_image",
    });
  }
  await assertNoMetadata(output.data);
  return {
    buffer: output.data,
    mimeType: "image/jpeg",
    extension: "jpg",
    width: output.info.width,
    height: output.info.height,
    sha256: sha256Hex(output.data),
    metadataStripped: true,
  };
}

// ---------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------

const VIDEO_EXTENSIONS: Record<VideoMimeType, StoredExtension> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * Validates one uploaded file for `purpose` and returns the bytes to store. Throws
 * DomainError("invalid_input") with a message naming the file when it is empty, too large,
 * not an allowed type for the purpose (HEIC photos get a "please export as JPEG" message),
 * or an image that cannot be decoded.
 */
export async function prepareUpload(input: UploadInput, purpose: UploadPurpose): Promise<PreparedUpload> {
  const limit = UPLOAD_LIMITS[purpose];
  const { noun, each } = PURPOSE_COPY[purpose];
  const subject = subjectFor(input.name);
  const size = Math.max(input.bytes.byteLength, Number.isFinite(input.size) ? input.size : 0);

  if (input.bytes.byteLength === 0) throw invalid(`${subject} is empty. Choose the file again.`, { reason: "empty" });
  if (size > limit.maxBytes) {
    // The size itself is not quoted: rounded, a file just over 8 MB would read "8 MB".
    throw invalid(`${subject} is too large. ${noun} can be up to ${formatBytes(limit.maxBytes)}${each ? " each" : ""}.`, {
      reason: "too_large",
      sizeBytes: size,
    });
  }

  const sniffed = sniffFileType(input.bytes);
  if (sniffed.kind === "heic") {
    if (allows(purpose, "image/jpeg")) {
      throw invalid(`${subject} is a HEIC photo. HEIC photos aren't supported yet - please export as JPEG.`, {
        reason: "heic",
      });
    }
    throw wrongTypeError(subject, purpose, sniffed);
  }
  if (sniffed.kind === "other" || !allows(purpose, sniffed.mimeType)) {
    throw wrongTypeError(subject, purpose, sniffed);
  }

  const source = asBuffer(input.bytes);
  switch (sniffed.kind) {
    case "image":
      return sanitizeImage(source, subject, limit.maxImageDimensionPx ?? 2048);
    case "video":
      // Stored as uploaded: container metadata (possibly GPS) cannot be removed without
      // ffmpeg, which is why videos are never shown to mechanics before a confirmed booking.
      return {
        buffer: source,
        mimeType: sniffed.mimeType,
        extension: VIDEO_EXTENSIONS[sniffed.mimeType],
        sha256: sha256Hex(source),
        metadataStripped: false,
      };
    case "pdf":
      return {
        buffer: source,
        mimeType: "application/pdf",
        extension: "pdf",
        sha256: sha256Hex(source),
        metadataStripped: false,
      };
  }
}

/** Throws DomainError("invalid_input") when more files are given than `purpose` allows. */
export function assertUploadCount(purpose: UploadPurpose, count: number): void {
  const { maxFiles } = UPLOAD_LIMITS[purpose];
  if (count > maxFiles) {
    const { noun } = PURPOSE_COPY[purpose];
    throw invalid(`Add up to ${maxFiles} ${maxFiles === 1 ? noun.toLowerCase().replace(/s$/, "") : noun.toLowerCase()}.`, {
      reason: "too_many_files",
    });
  }
}

/**
 * The non-empty files a form field submitted. Browsers send an empty, nameless File when
 * a file input is left blank; those are skipped.
 */
export function filesFromFormData(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((value): value is File => typeof value !== "string" && value.size > 0);
}

/**
 * On the hosted site, a message when the files of one form submission add up to more than
 * the request budget (HOSTED_UPLOAD_MAX_BYTES); null when they fit or there is no budget.
 * Browsers shrink photos and check this before sending; this is the server's own check.
 */
export function uploadBudgetProblem(formData: FormData, budget: number | null = HOSTED_UPLOAD_MAX_BYTES): string | null {
  if (budget === null) return null;
  let total = 0;
  for (const [, value] of formData) if (typeof value !== "string") total += value.size;
  if (total <= budget) return null;
  return `These files add up to ${formatBytes(total)}, more than the ${formatBytes(budget)} one upload can carry on this site. Choose fewer or smaller files.`;
}

/** Reads a submitted File into the shape prepareUpload expects. */
export async function uploadInputFromFile(file: File): Promise<UploadInput> {
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, size: file.size };
}

export type SavedFile = {
  id: string;
  storageKey: string;
  purpose: UploadPurpose;
  mimeType: StoredMimeType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
};

/**
 * Stores prepared bytes under a generated key ("<purpose dir>/<yyyy>/<file id>.<ext>") and
 * inserts the files row through `trx`. If the insert fails, the stored bytes are removed
 * before the error is rethrown. If the surrounding transaction rolls back later, call
 * discardStoredFiles with the returned records.
 */
export async function saveFile(
  trx: Tx,
  ctx: AppContext,
  ownerId: string,
  prepared: PreparedUpload,
  purpose: UploadPurpose,
  originalName: string | null,
): Promise<SavedFile> {
  if (!allows(purpose, prepared.mimeType)) {
    throw new Error(`saveFile: ${prepared.mimeType} is not allowed for ${purpose}`);
  }
  const id = newId();
  const storageKey = `${PURPOSE_DIRECTORIES[purpose]}/${ctx.now.getUTCFullYear()}/${id}.${prepared.extension}`;
  const record: SavedFile = {
    id,
    storageKey,
    purpose,
    mimeType: prepared.mimeType,
    sizeBytes: prepared.buffer.byteLength,
    width: prepared.width ?? null,
    height: prepared.height ?? null,
    sha256: prepared.sha256,
  };

  await ctx.storage.put(storageKey, prepared.buffer);
  try {
    await trx
      .insertInto("files")
      .values({
        id,
        owner_user_id: ownerId,
        purpose,
        storage_key: storageKey,
        mime_type: prepared.mimeType,
        size_bytes: record.sizeBytes,
        width: record.width,
        height: record.height,
        sha256: prepared.sha256,
        metadata_stripped: prepared.metadataStripped ? 1 : 0,
        original_name: sanitizeOriginalName(originalName),
        created_at: ctx.now.toISOString(),
      })
      .execute();
  } catch (error) {
    await ctx.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return record;
}

/** Best-effort removal of stored bytes whose files rows were rolled back. */
export async function discardStoredFiles(
  ctx: AppContext,
  files: readonly Pick<SavedFile, "storageKey">[],
): Promise<void> {
  await Promise.all(files.map((file) => ctx.storage.remove(file.storageKey).catch(() => undefined)));
}
