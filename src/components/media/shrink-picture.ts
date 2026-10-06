// Shrinks pictures in the browser before they are sent to the hosted site, where one request
// may carry only a few MB (UploadBudget in media-types.ts): scaled to fit the long-edge limit
// and re-encoded as JPEG, stepping the quality and then the size down until the picture is
// about the target size. The server still identifies, re-encodes and strips every picture.

import type { UploadBudget } from "./media-types";
import { fitWithin, isShrinkablePicture, jpegName, pictureTargetBytes } from "./upload-budget";

/** JPEG qualities tried in turn at each size... */
const QUALITIES = [0.86, 0.78, 0.7, 0.62] as const;
/** ...and the sizes, as fractions of the long-edge limit. */
const SCALES = [1, 0.8, 0.64] as const;

export type ShrinkTarget = { maxEdgePx: number; targetBytes: number };

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/** Decodes `file` the way it is meant to be seen: rotated as its EXIF orientation says. */
async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Browsers that don't know the option: an <img> is drawn with its orientation applied too.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Paints `image` at `width` x `height` on white (transparent areas become white, as on the server). */
function paint(context: Context2D | null, image: Decoded, width: number, height: number): void {
  if (!context) throw new Error("No 2D canvas available.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, 0, 0, width, height);
}

/** A function that encodes the painted picture as JPEG at a quality (null when the browser can't). */
type Encoder = (quality: number) => Promise<Blob | null>;

function render(image: Decoded, width: number, height: number): Encoder {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    paint(canvas.getContext("2d"), image, width, height);
    return async (quality) => {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      return blob.type === "image/jpeg" ? blob : null;
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), image, width, height);
  return (quality) =>
    new Promise((resolve) => canvas.toBlob((blob) => resolve(blob?.type === "image/jpeg" ? blob : null), "image/jpeg", quality));
}

function asFile(blob: Blob, original: File): File {
  return new File([blob], jpegName(original.name), { type: "image/jpeg", lastModified: original.lastModified });
}

/**
 * A JPEG copy of `file` at most `maxEdgePx` on its long edge and, where that can be done,
 * at most `targetBytes`. Returns `file` itself when it is already that small, isn't a JPEG,
 * PNG or WebP picture, or can't be decoded here (the server checks every file anyway).
 */
export async function shrinkPicture(file: File, { maxEdgePx, targetBytes }: ShrinkTarget): Promise<File> {
  if (!isShrinkablePicture(file) || file.size <= targetBytes) return file;
  let image: Decoded;
  try {
    image = await decode(file);
  } catch {
    return file;
  }
  try {
    const fitted = fitWithin(image.width, image.height, maxEdgePx);
    let smallest: Blob | null = null;
    for (const scale of SCALES) {
      const encode = render(image, Math.max(1, Math.round(fitted.width * scale)), Math.max(1, Math.round(fitted.height * scale)));
      for (const quality of QUALITIES) {
        const blob = await encode(quality);
        if (!blob) continue;
        if (blob.size <= targetBytes) return asFile(blob, file);
        if (!smallest || blob.size < smallest.size) smallest = blob;
      }
    }
    return smallest && smallest.size < file.size ? asFile(smallest, file) : file;
  } catch {
    return file;
  } finally {
    image.release();
  }
}

/**
 * `files` as they should be sent together under `budget`: pictures shrunk, each to its share
 * of the request (one at a time, to keep memory low); other files unchanged.
 */
export async function shrinkPicturesFor(files: readonly File[], budget: UploadBudget): Promise<File[]> {
  const target = { maxEdgePx: budget.imageMaxEdgePx, targetBytes: pictureTargetBytes(budget, files.length) };
  const shrunk: File[] = [];
  for (const file of files) shrunk.push(await shrinkPicture(file, target));
  return shrunk;
}
