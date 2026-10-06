import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a second dev server or a trial build use its own output folder
  // (e.g. ".next-check") without touching a running `next start`, which serves ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Native and database driver packages stay out of the server bundle and load from
  // node_modules at runtime (Next.js lists all four by default too). better-sqlite3 is the
  // local database; @libsql/client is the Turso driver. On Vercel the app uses its web build
  // (HTTP, no native code); its native helper libsql serves only local `file:` URLs.
  serverExternalPackages: ["better-sqlite3", "sharp", "@libsql/client", "libsql"],
  // Files the build must copy into the deployed functions besides what it traces itself: on
  // Vercel a function has only the files traced for it. Keys are route globs.
  outputFileTracingIncludes: {
    // sharp (photo processing in the upload actions of many pages) loads its platform addon
    // from @img/sharp-<platform>, and the addon loads libvips: a DLL beside it on Windows,
    // @img/sharp-libvips-<platform> on Linux. The tracer copies the addon but not libvips, so
    // sharp would fail to load in a deployed function; every installed @img/sharp-* package
    // goes in whole (on Vercel: sharp-linux-x64 and sharp-libvips-linux-x64).
    "/*": ["./node_modules/@img/sharp-*/**/*"],
    // Read with fs by the MapLibre worker route.
    "/vendor/maplibre-gl/**": [
      "./node_modules/maplibre-gl/package.json",
      "./node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
      "./node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs",
    ],
  },
  // Traced files no deployed function ever loads. libsql picks its native addon with a computed
  // require(`@libsql/${target}`), which the tracer expands to every installed @libsql package:
  // the addons for each platform npm installed and @libsql/kysely-libsql (unused by the app; it
  // carries an older copy of the driver). That is about 30 MB per function on Vercel's Linux
  // build, yet the hosted app reaches Turso through @libsql/client/web over HTTP, and only local
  // `file:` URLs need the addon (local runs use node_modules directly, not these traces).
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/@libsql/kysely-libsql/**/*",
      "./node_modules/@libsql/darwin-*/**/*",
      "./node_modules/@libsql/linux-*/**/*",
      "./node_modules/@libsql/win32-*/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // A repair request may carry up to 5 photos (8 MB each) and one 40 MB video.
      // Every file is re-validated on the server; this is only the transport cap. On Vercel
      // the platform rejects any request body over 4.5 MB first (see docs/DEPLOY.md).
      bodySizeLimit: "90mb",
    },
    // src/proxy.ts runs on protected areas (e.g. /mechanic/apply uploads); without this,
    // Next.js would buffer only the first 10 MB of a request body and truncate the rest.
    proxyClientMaxBodySize: "90mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
