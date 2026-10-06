import type { NextRequest } from "next/server";

import { getViewer } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { STREAMED_FILE_MAX_BYTES } from "@/server/storage/config";
import { getViewableFile, type FilePurpose } from "@/server/storage/file-access";

// GET /api/files/<id>: streams a private upload after the policy check in file-access.ts.
// Missing files, files the viewer may not see and signed-out requests all get the same
// 404, so a file's existence is never revealed. Files in Vercel Blob larger than
// STREAMED_FILE_MAX_BYTES (Vercel Functions cannot send responses over 4.5 MB, e.g. longer
// videos) get a redirect to a signed URL valid for a few minutes instead; the Blob CDN then
// serves the bytes (with byte ranges), as an attachment where this route would send one. The
// redirect is never cached, so every request passes the policy check again.

type RouteContext = { params: Promise<{ id: string }> };

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

const FILE_NAME_STEMS: Readonly<Record<FilePurpose, string>> = {
  request_photo: "request-photo",
  request_video: "request-video",
  mechanic_profile_photo: "profile-photo",
  mechanic_document: "document",
  user_avatar: "profile-picture",
  mechanic_gallery: "gallery-photo",
  booking_photo: "booking-photo",
};

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || error.name === "InvalidStorageKeyError";
}

type ByteRange = { start: number; end: number };

/**
 * Parses a single "bytes=start-end" range (also "start-" and "-suffix"). Returns null to
 * serve the whole file (no header, several ranges or a malformed header) and
 * "unsatisfiable" for a range that starts beyond the end.
 */
function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size) return "unsatisfiable";
  if (end < start) return null;
  return { start, end };
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const viewer = await getViewer();
  if (!viewer) return notFound();

  const ctx = createAppContext();
  const file = await getViewableFile(ctx, viewer, id);
  if (!file) return notFound();
  const disposition = file.mimeType === "application/pdf" ? "attachment" : "inline";

  if (ctx.storage.signedReadUrl && file.sizeBytes > STREAMED_FILE_MAX_BYTES) {
    let location: string;
    try {
      location = await ctx.storage.signedReadUrl(file.storageKey, { download: disposition === "attachment" });
    } catch (error) {
      if (isMissingFileError(error)) return notFound();
      throw error;
    }
    return new Response(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: location } });
  }

  let data: Buffer;
  try {
    data = await ctx.storage.read(file.storageKey);
  } catch (error) {
    if (isMissingFileError(error)) return notFound();
    throw error;
  }

  const extension = EXTENSIONS[file.mimeType] ?? "bin";
  // A generic name: the uploader's original file name is never sent back.
  const fileName = `${FILE_NAME_STEMS[file.purpose]}-${file.id.slice(0, 8)}.${extension}`;
  const isVideo = file.mimeType.startsWith("video/");
  const headers: Record<string, string> = {
    ...PRIVATE_HEADERS,
    "Content-Type": file.mimeType,
    "Content-Disposition": `${disposition}; filename="${fileName}"`,
  };

  // Byte ranges let browsers seek in videos (Safari will not play video without them).
  const range = isVideo ? parseRange(request.headers.get("range"), data.byteLength) : null;
  if (isVideo) headers["Accept-Ranges"] = "bytes";
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...PRIVATE_HEADERS, "Content-Range": `bytes */${data.byteLength}` },
    });
  }

  const body = range ? data.subarray(range.start, range.end + 1) : data;
  headers["Content-Length"] = String(body.byteLength);
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${data.byteLength}`;

  return new Response(streamOf(body), { status: range ? 206 : 200, headers });
}

const CHUNK_BYTES = 64 * 1024;

/** Streams bytes in chunks, without copying them. */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + CHUNK_BYTES, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}
