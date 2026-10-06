// Upload size rules for the hosted site (one request carries only a few MB on Vercel): the
// browser-side helpers in src/components/media (what gets shrunk, to what size, when a form is
// over its budget, the "still shrinking" signal) and the server's own budget check.
import { describe, expect, it } from "vitest";

import type { UploadBudget } from "@/components/media/media-types";
import { shrinkPicture, shrinkPicturesFor } from "@/components/media/shrink-picture";
import {
  FILES_REPLACED_EVENT,
  fitWithin,
  isShrinkablePicture,
  jpegName,
  markShrinking,
  overBudgetMessage,
  pictureTargetBytes,
  totalBytes,
} from "@/components/media/upload-budget";
import { uploadBudgetProblem } from "@/server/storage/uploads";

const MiB = 1024 * 1024;
const BUDGET: UploadBudget = { maxRequestBytes: 4 * MiB, imageMaxEdgePx: 2048, imageTargetBytes: MiB };

function fileOf(size: number, name: string, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("what the browser shrinks", () => {
  it("only JPEG, PNG and WebP pictures, recognised by type or (without one) by name", () => {
    expect(isShrinkablePicture({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isShrinkablePicture({ type: "image/png", name: "scan" })).toBe(true);
    expect(isShrinkablePicture({ type: "image/webp", name: "a.webp" })).toBe(true);
    expect(isShrinkablePicture({ type: "", name: "IMG_2041.JPEG" })).toBe(true);
    expect(isShrinkablePicture({ type: "image/heic", name: "IMG_1.heic" })).toBe(false);
    expect(isShrinkablePicture({ type: "application/pdf", name: "id.pdf" })).toBe(false);
    expect(isShrinkablePicture({ type: "video/mp4", name: "clip.mp4" })).toBe(false);
    expect(isShrinkablePicture({ type: "", name: "notes.txt" })).toBe(false);
  });

  it("scales the long edge down to the limit, keeping the shape, and never scales up", () => {
    expect(fitWithin(6000, 4000, 2048)).toEqual({ width: 2048, height: 1365 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(4000, 3000, 512)).toEqual({ width: 512, height: 384 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 10, 1600)).toEqual({ width: 1600, height: 2 });
    expect(fitWithin(0, 0, 2048)).toEqual({ width: 1, height: 1 });
  });

  it("aims each picture at the budget's target, or an equal share of the request when smaller", () => {
    expect(pictureTargetBytes(BUDGET, 1)).toBe(MiB);
    expect(pictureTargetBytes(BUDGET, 4)).toBe(MiB);
    expect(pictureTargetBytes(BUDGET, 5)).toBe(Math.floor((4 * MiB) / 5));
    expect(pictureTargetBytes(BUDGET, 12)).toBe(Math.floor((4 * MiB) / 12));
    expect(pictureTargetBytes(BUDGET, 0)).toBe(MiB);
  });

  it("sends a re-encoded picture under a .jpg name", () => {
    expect(jpegName("IMG_2041.PNG")).toBe("IMG_2041.jpg");
    expect(jpegName("brake pads.webp")).toBe("brake pads.jpg");
    expect(jpegName("archive.v2.jpeg")).toBe("archive.v2.jpg");
    expect(jpegName("noextension")).toBe("noextension.jpg");
    expect(jpegName(".png")).toBe("photo.jpg");
  });
});

describe("shrinkPicture without decoding", () => {
  it("returns files that are small enough, or not pictures, unchanged", async () => {
    const small = fileOf(200_000, "small.jpg", "image/jpeg");
    const pdf = fileOf(3 * MiB, "id.pdf", "application/pdf");
    const video = fileOf(3 * MiB, "clip.mp4", "video/mp4");
    expect(await shrinkPicture(small, { maxEdgePx: 2048, targetBytes: MiB })).toBe(small);
    expect(await shrinkPicture(pdf, { maxEdgePx: 2048, targetBytes: MiB })).toBe(pdf);
    expect(await shrinkPicturesFor([small, pdf, video], BUDGET)).toEqual([small, pdf, video]);
  });

  it("keeps a picture it cannot decode as it is (the budget check and the server still apply)", async () => {
    // Node has no canvas or image decoder, like a browser that can't read the file.
    const big = fileOf(6 * MiB, "big.jpg", "image/jpeg");
    expect(await shrinkPicture(big, { maxEdgePx: 2048, targetBytes: MiB })).toBe(big);
  });
});

describe("the request budget", () => {
  it("adds up files and explains what to do when they don't fit", () => {
    expect(totalBytes([{ size: 1 }, { size: 2 }, { size: 3 }])).toBe(6);
    expect(overBudgetMessage(4 * MiB, BUDGET, "Remove a photo.")).toBeNull();
    expect(overBudgetMessage(5 * MiB, BUDGET, "Remove a photo or choose a shorter video.")).toBe(
      "These files add up to 5 MB, more than the 4 MB one upload can carry on this site. Remove a photo or choose a shorter video.",
    );
  });

  it("is checked again on the server, over every file in the form", () => {
    const form = new FormData();
    form.append("requestId", "r1");
    form.append("photos", fileOf(2 * MiB, "a.jpg", "image/jpeg"));
    form.append("video", fileOf(MiB, "clip.mp4", "video/mp4"));
    expect(uploadBudgetProblem(form, null)).toBeNull();
    expect(uploadBudgetProblem(form, 3 * MiB)).toBeNull();
    form.append("photos", fileOf(MiB + 1, "b.jpg", "image/jpeg"));
    expect(uploadBudgetProblem(form, 3 * MiB)).toBe(
      "These files add up to 4 MB, more than the 3 MB one upload can carry on this site. Choose fewer or smaller files.",
    );
  });
});

describe("the 'still shrinking' signal", () => {
  /** Just enough of a file input for markShrinking: attributes and events. */
  class FakeInput extends EventTarget {
    readonly attributes = new Set<string>();
    hasAttribute(name: string): boolean {
      return this.attributes.has(name);
    }
    toggleAttribute(name: string, force: boolean): boolean {
      if (force) this.attributes.add(name);
      else this.attributes.delete(name);
      return force;
    }
  }

  it("marks the input while busy and announces each change once, so a held submit can go ahead", () => {
    const input = new FakeInput();
    const events: boolean[] = [];
    input.addEventListener(FILES_REPLACED_EVENT, () => events.push(input.hasAttribute("data-shrinking")));
    const element = input as unknown as HTMLInputElement;
    markShrinking(element, false);
    markShrinking(element, true);
    markShrinking(element, true);
    markShrinking(element, false);
    markShrinking(element, false);
    expect(events).toEqual([true, false]);
    expect(input.hasAttribute("data-shrinking")).toBe(false);
  });
});
