import sharp from "sharp";

// Small upload fixtures made on the fly: real JPEGs (sharp), a tiny one-page PDF and a minimal
// MP4 header (the app recognizes videos by their bytes and stores them as uploaded).

export type UploadFile = { name: string; mimeType: string; buffer: Buffer };

let jpegCounter = 0;

/** A small JPEG with a colored gradient-like pattern, different on every call. */
export async function makeJpeg(name = "photo.jpg", options: { width?: number; height?: number } = {}): Promise<UploadFile> {
  jpegCounter += 1;
  const width = options.width ?? 320;
  const height = options.height ?? 240;
  const hue = (jpegCounter * 47 + Math.floor(Math.random() * 360)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 120) % 360},70%,25%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="hsl(${(hue + 200) % 360},80%,60%)"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return { name, mimeType: "image/jpeg", buffer };
}

/** A minimal, well-formed one-page PDF. */
export function makePdf(name = "document.pdf", text = "Sample document for automated testing"): UploadFile {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body, "latin1") };
}

/** The first boxes of an MP4 file ("ftyp" isom + an empty "mdat"): enough to be recognized. */
export function makeMp4(name = "clip.mp4"): UploadFile {
  const ftyp = Buffer.alloc(32);
  ftyp.writeUInt32BE(32, 0);
  ftyp.write("ftyp", 4, "latin1");
  ftyp.write("isom", 8, "latin1");
  ftyp.writeUInt32BE(0x200, 12);
  ftyp.write("isomiso2avc1mp41", 16, "latin1");
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(16, 0);
  mdat.write("mdat", 4, "latin1");
  return { name, mimeType: "video/mp4", buffer: Buffer.concat([ftyp, mdat]) };
}
