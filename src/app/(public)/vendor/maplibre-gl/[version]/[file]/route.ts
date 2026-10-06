import { readFile } from "node:fs/promises";
import path from "node:path";

// Serves MapLibre GL's web-worker modules from the installed package. MapLibre 6 starts its
// worker from a URL (src/components/map/map-view.tsx calls setWorkerUrl with this route), and
// the worker imports "./maplibre-gl-shared.mjs" relative to itself, so both files live here.
// Only these two files are served, and only for the installed version (immutable caching).
//
// Every path below is a literal, so the production build traces exactly these three files
// into the deployed function (Vercel has no node_modules at runtime); next.config.ts lists
// them in outputFileTracingIncludes as well.

let installedVersion: Promise<string | null> | undefined;

function readInstalledVersion(): Promise<string | null> {
  installedVersion ??= readFile(path.join(process.cwd(), "node_modules/maplibre-gl/package.json"), "utf8")
    .then((text) => {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null && "version" in parsed && typeof parsed.version === "string"
        ? parsed.version
        : null;
    })
    .catch(() => null);
  return installedVersion;
}

/** The served file's contents, or null for any other name. */
function readServedFile(file: string): Promise<Buffer> | null {
  switch (file) {
    case "maplibre-gl-worker.mjs":
      return readFile(path.join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"));
    case "maplibre-gl-shared.mjs":
      return readFile(path.join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs"));
    default:
      return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ version: string; file: string }> }) {
  const { version, file } = await context.params;
  const pending = version === (await readInstalledVersion()) ? readServedFile(file) : null;
  if (!pending) return new Response("Not found", { status: 404 });
  try {
    const body = await pending;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        // s-maxage lets a CDN (Vercel's) keep the file too; browsers use max-age.
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
