// Generated sample pictures: request, gallery and booking photos (illustrated scenes from
// ./art), profile pictures (neon monograms) and the mechanics' documents (marked SAMPLE).
// Each is drawn as SVG, rendered with sharp and then passed through the app's own
// prepareUpload like any upload, so it is validated, re-encoded and stripped of all
// metadata. Nothing is downloaded: every picture is original artwork drawn here.
import type { UploadPurpose } from "@/server/config";
import { prepareUpload, type PreparedUpload } from "@/server/storage/uploads";

import { SCENES, type SceneKey } from "./art/catalog";
import { idCardSvg, insuranceSvg } from "./art/documents";
import { monogramAvatar, type AvatarPalette } from "./art/portraits";
import { rasterize } from "./art/render";

/** A prepared file plus its display name: the shape the request, mechanic and media commands take. */
export type SeedUpload = { prepared: PreparedUpload; originalName: string };

/** Film grain for the photos (documents and avatars stay clean). */
const PHOTO_GRAIN = 22;

// Rendering is the slow part (about a second per scene), so each distinct picture is drawn
// and prepared once per process and its bytes reused for every file that shows it.
const prepared = new Map<string, Promise<PreparedUpload>>();

function prepareOnce(key: string, purpose: UploadPurpose, draw: () => Promise<Buffer>, fileName: string): Promise<PreparedUpload> {
  const cacheKey = `${purpose}:${key}`;
  let entry = prepared.get(cacheKey);
  if (!entry) {
    entry = draw().then((bytes) => prepareUpload({ bytes, name: fileName, size: bytes.byteLength }, purpose));
    prepared.set(cacheKey, entry);
    // A failed render must not poison the cache for a later run in the same process.
    entry.catch(() => prepared.delete(cacheKey));
  }
  return entry;
}

const renderedScenes = new Map<SceneKey, Promise<Buffer>>();

function renderScene(scene: SceneKey): Promise<Buffer> {
  let entry = renderedScenes.get(scene);
  if (!entry) {
    entry = rasterize(SCENES[scene](), { grain: PHOTO_GRAIN });
    renderedScenes.set(scene, entry);
    entry.catch(() => renderedScenes.delete(scene));
  }
  return entry;
}

export type PhotoPurpose = "request_photo" | "mechanic_gallery" | "booking_photo";

/** A photo of a scene, as the "uploaded" file `fileName` (e.g. "civic-front-left-wheel.jpg"). */
export type PhotoSpec = { scene: SceneKey; fileName: string };

export async function samplePhoto(spec: PhotoSpec, purpose: PhotoPurpose = "request_photo"): Promise<SeedUpload> {
  const upload = await prepareOnce(spec.scene, purpose, () => renderScene(spec.scene), spec.fileName);
  return { prepared: upload, originalName: spec.fileName };
}

/** Renders every scene once, a few at a time, so later steps find them ready. */
export async function warmSceneCache(scenes: readonly SceneKey[], concurrency = 4): Promise<void> {
  const queue = [...new Set(scenes)];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let scene = queue.shift(); scene !== undefined; scene = queue.shift()) await renderScene(scene);
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------------
// Profile pictures
// ---------------------------------------------------------------------------------

export type MonogramSpec = { initials: string; palette: AvatarPalette };

/** A neon monogram: a mechanic's profile photo (with a wrench badge) or a customer's avatar. */
export async function monogramPicture(
  spec: MonogramSpec,
  purpose: "mechanic_profile_photo" | "user_avatar",
  fileName: string,
): Promise<SeedUpload> {
  const badge = purpose === "mechanic_profile_photo";
  const key = `${spec.initials}:${spec.palette}:${badge ? "badge" : "plain"}`;
  const upload = await prepareOnce(key, purpose, () => rasterize(monogramAvatar({ ...spec, badge })), fileName);
  return { prepared: upload, originalName: fileName };
}

// ---------------------------------------------------------------------------------
// Mechanic documents (marked SAMPLE; one PDF)
// ---------------------------------------------------------------------------------

export type IdDocumentSpec = {
  fullName: string;
  documentNumber: string;
  expiresOn: string;
  fileName: string;
  /** Render it out of focus (a document an admin would reject as unreadable). */
  blurred?: boolean;
};

/** A sample photo-ID card for a fictional person. */
export async function idDocument(spec: IdDocumentSpec): Promise<SeedUpload> {
  const key = `id:${spec.fullName}:${spec.documentNumber}:${spec.expiresOn}:${spec.blurred ? 1 : 0}`;
  const draw = () => rasterize(idCardSvg(spec));
  return { prepared: await prepareOnce(key, "mechanic_document", draw, spec.fileName), originalName: spec.fileName };
}

export type InsuranceCertificateSpec = {
  insuredName: string;
  provider: string;
  policyNumber: string;
  effectiveOn: string;
  expiresOn: string;
  fileName: string;
};

/** A sample certificate of liability insurance. */
export async function insuranceCertificate(spec: InsuranceCertificateSpec): Promise<SeedUpload> {
  const key = `insurance:${spec.insuredName}:${spec.policyNumber}:${spec.effectiveOn}:${spec.expiresOn}`;
  const draw = () => rasterize(insuranceSvg(spec));
  return { prepared: await prepareOnce(key, "mechanic_document", draw, spec.fileName), originalName: spec.fileName };
}

export type PdfLine = { text: string; size: number };

/**
 * A minimal valid one-page PDF (PDF 1.4, Helvetica). Text must be printable ASCII: the
 * cross-reference table needs exact byte offsets.
 */
export function tinyPdf(lines: readonly PdfLine[]): Buffer {
  for (const line of lines) {
    if (!/^[\x20-\x7e]*$/.test(line.text)) throw new Error(`PDF text must be printable ASCII: "${line.text}"`);
  }
  const escape = (value: string) => value.replace(/[\\()]/g, (character) => `\\${character}`);
  const content = [
    "BT",
    "72 720 Td",
    ...lines.flatMap((line, index) => [
      ...(index === 0 ? [] : [`0 -${Math.round(line.size * 1.8)} Td`]),
      `/F1 ${line.size} Tf`,
      `(${escape(line.text)}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** A tiny PDF document upload (stored as-is: PDFs are not re-encoded). */
export async function samplePdf(spec: { lines: readonly PdfLine[]; fileName: string }): Promise<SeedUpload> {
  const pdf = tinyPdf(spec.lines);
  const upload = await prepareUpload({ bytes: pdf, name: spec.fileName, size: pdf.byteLength }, "mechanic_document");
  return { prepared: upload, originalName: spec.fileName };
}
