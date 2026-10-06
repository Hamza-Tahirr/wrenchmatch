// Turns a generated SVG into image bytes with sharp (librsvg), adding a fine film grain so
// the illustrated "photos" read like camera pictures. The bytes then go through the app's
// own prepareUpload (re-encoded, metadata removed) like any upload.
import sharp from "sharp";

import { rng } from "./kit";

const grainCache = new Map<string, Buffer>();

/** A centred noise layer (128 +/- amplitude), the same for every picture of one size. */
function grainLayer(width: number, height: number, amplitude: number): Buffer {
  const key = `${width}x${height}x${amplitude}`;
  const cached = grainCache.get(key);
  if (cached) return cached;
  const random = rng(width * 31 + height * 17 + amplitude);
  const layer = Buffer.alloc(width * height);
  for (let index = 0; index < layer.length; index += 1) {
    // Sum of two uniforms: a softer, roughly triangular distribution.
    layer[index] = Math.max(0, Math.min(255, Math.round(128 + (random() + random() - 1) * amplitude)));
  }
  grainCache.set(key, layer);
  return layer;
}

export type RasterOptions = {
  /** Film-grain strength (0 = none). Photos use about 22; documents none. */
  grain?: number;
};

/** Renders the SVG at its own width/height and returns lossless PNG bytes. */
export async function rasterize(svg: string, options: RasterOptions = {}): Promise<Buffer> {
  const image = sharp(Buffer.from(svg), { limitInputPixels: 40_000_000 });
  const grain = options.grain ?? 0;
  if (grain <= 0) return image.png({ compressionLevel: 2 }).toBuffer();
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .composite([
      {
        input: grainLayer(info.width, info.height, grain),
        raw: { width: info.width, height: info.height, channels: 1 },
        blend: "soft-light",
      },
    ])
    .png({ compressionLevel: 2 })
    .toBuffer();
}
