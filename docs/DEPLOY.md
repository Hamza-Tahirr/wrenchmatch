# Deploying WrenchMatch to Vercel

WrenchMatch runs locally on a SQLite file and a private upload folder. The same code also runs
on **Vercel** (Hobby plan), which gives the app a permanent public link. Vercel functions have no
lasting disk, so the hosted site keeps its data in two hosted services instead:

| Piece | On this laptop | On Vercel |
| --- | --- | --- |
| App server | `npm run dev` or `npm start` | Vercel Functions in Mumbai (`bom1`), Node.js 24 |
| Database | SQLite file `.data/app.db` (better-sqlite3) | **Turso** (hosted libSQL, SQLite-compatible), database `wrenchmatch-db` in AWS `ap-south-1` (Mumbai) |
| Uploads | `.data/uploads` | **Vercel Blob**, private store `wrenchmatch-uploads` (`bom1`) |
| Files to browsers | `GET /api/files/[id]` after a permission check | the same route; files over 4 MB get a short-lived signed link |

The app picks the hosted services only when their variables are set (`TURSO_DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`). Without them it uses the local file and folder, so local development,
the unit/integration tests and the Playwright suite work exactly as before.

Everything else stays the same on the hosted site: **online payments are coming soon** (no
checkout, nothing is charged), email is only captured in the admin "Email outbox", ratings come
only from genuine reviews, and sample ID/insurance images stay marked "SAMPLE".

> **Hobby plan: personal, non-commercial use only.** Vercel's fair-use rules limit Hobby
> projects to non-commercial use. Showing the prototype is fine; before a real pilot with paying
> customers, move the project to Pro. Hobby has fixed free allowances (for example 4 hours of
> active CPU and 1,000,000 function calls a month) with no paid overage: if one runs out, that
> feature pauses for up to 30 days. A demo stays far below them.

## What is set up today

| Resource | Details |
| --- | --- |
| Vercel project | `hamza-tahirrs-projects/wrenchmatch`, linked to this folder by `.vercel/project.json` (git-ignored) |
| Function region | `bom1` (Mumbai), set in `vercel.json`. Hobby allows exactly one region. |
| Turso database | `wrenchmatch-db`, region `aws-ap-south-1`, created through the **Vercel Marketplace** (Turso Cloud integration; the owner accepted the integration's terms once in the Vercel dashboard). It runs SQLite 3.47; the libSQL driver the tests use locally (`file:` URLs) runs 3.45, the older of the two. |
| Blob store | `wrenchmatch-uploads`, **private** access, region `bom1`, connected to the project |
| Credentials | Vercel project environment variables (added by the integration and the store connection). A local copy for the push scripts lives in **`.env.vercel`** (git-ignored, never deployed, and not a file Next.js loads). |

Never copy hosted credentials into `.env.local`: it must contain only `DEMO_MODE=true` (see
[Keep hosted credentials out of the local app](#keep-hosted-credentials-out-of-the-local-app)).

## Environment variables

| Variable | Where | What it does |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Vercel; `.env.vercel` | The Turso database, e.g. `libsql://wrenchmatch-db-<org>.aws-ap-south-1.turso.io`. When set, the app uses it instead of `DATABASE_PATH`, over HTTPS (`@libsql/client/web`, no native code). Added by the Turso integration. |
| `TURSO_AUTH_TOKEN` | Vercel; `.env.vercel` | Auth token for that database. Added by the Turso integration. |
| `BLOB_READ_WRITE_TOKEN` | Vercel; `.env.vercel` | Read-write token of the private Blob store. When set, uploads are stored there instead of `UPLOAD_DIR`. Added when the store is connected to the project. |
| `BLOB_STORE_ID` | Vercel (optional) | Store id that newer store connections add for sign-in with Vercel's OIDC token. Either this or the token switches uploads to Blob. |
| `HOSTED_UPLOAD_MAX_BYTES` | optional | Most bytes of files one form may send on the hosted site. Default on Vercel: 4 MiB (`4194304`), under Vercel's 4.5 MB request limit. Set it locally to try the hosted upload behaviour on your computer. |
| `DEMO_MODE` | this laptop only | One-click sample logins. **Leave it unset on Vercel.** Even if it were set, the login page offers them only on `localhost`. |
| `DATABASE_PATH`, `UPLOAD_DIR` | this laptop only | Local SQLite file and upload folder (defaults `.data/app.db`, `.data/uploads`). |
| `NEXT_DIST_DIR` | this laptop only | Build folder (default `.next`); lets a trial build or a second dev server run next to `npm start`. Never set it on Vercel. |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_OIDC_TOKEN`, … | set by Vercel | The app reads `VERCEL=1` to apply the hosted upload limit and to refuse writing uploads to the function's disk. |

Changing a variable in the Vercel dashboard affects the **next** deployment only: redeploy
afterwards (`vercel deploy --prod`).

## First deployment, step by step

The commands use the Vercel CLI (`vercel`, or `npx vercel` without a global install) from the
project folder, with the portable Node 24 first on `PATH` (see the README).

### 1. Link the folder to the project

```bash
vercel link --yes --project wrenchmatch --scope hamza-tahirrs-projects
```

This writes `.vercel/project.json`. Then check `.env.local` and `.gitignore` (see
[Vercel CLI side effects](#vercel-cli-side-effects-on-this-laptop)).

### 2. Create the private Blob store

In the Vercel dashboard: the project, then **Storage**, **Create**, **Blob**. Name it
`wrenchmatch-uploads`, choose **Private** access and the **Mumbai (bom1)** region, and connect
it to the project for Production, Preview and Development. Vercel adds `BLOB_READ_WRITE_TOKEN`
to the project. The store must be private: the app never hands out permanent public links, only
short-lived signed ones after its own permission check.

### 3. Add the Turso database

**Through the Vercel Marketplace (how it was done):** the project, then **Storage** (or
**Integrations**), **Turso Cloud**, **Install**. Accept the integration's terms (needed once
per Vercel account), create the database `wrenchmatch-db` in **AWS ap-south-1 (Mumbai)** and
connect it to the project. The integration adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

**Or with a turso.tech account:** create the database in the `aws-ap-south-1` location, then
read its URL and make a token with the Turso CLI and add both to the project:

```bash
turso db show wrenchmatch-db --url          # libsql://wrenchmatch-db-<org>.aws-ap-south-1.turso.io
turso db tokens create wrenchmatch-db       # prints the token
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
```

Keep the database in the same area as the functions (Mumbai): every page makes several
database round trips.

### 4. Get the credentials for the push scripts

```bash
vercel env pull .env.vercel --environment=production --yes
```

Always name the file. `vercel env pull` without a file name writes `.env.local`, which the local
app reads. If a value arrives empty or as a placeholder (Vercel cannot show "sensitive"
variables), copy it into `.env.vercel` by hand from the Turso dashboard or the Blob store page.

The scripts that work on the hosted site take the credentials from the environment first and
from `.env.vercel` second. Only those scripts read `.env.vercel`, and they never load it into the
app's settings. Like every script they also load `.env.local` (for `DATABASE_PATH` and the
like), which is one more reason to keep hosted credentials out of it. Instead of a file you can
also pass the variables in directly, e.g. `vercel env run -e production -- npm run db:push:remote`.

### 5. Put the sample data online

```bash
npm run db:reset              # fresh sample data and pictures on this laptop (.data/)
npm run db:push:remote        # copy the local database to Turso (replaces what is there)
npm run uploads:push:remote   # copy the local pictures and documents to the Blob store
```

The hosted database then holds the same accounts, requests, quotes and bookings as the local
one, and the Blob store holds their pictures under the same paths. Run the pushes before the
first visitor arrives: until then the hosted pages report that the database has no schema.

- `db:push:remote` replaces everything in the hosted database in one transaction (a push that
  fails leaves it as it was), then reads it back and compares every table with the local copy.
- `uploads:push:remote` overwrites files of the same name, so it can be run again safely;
  `npm run uploads:push:remote -- --dry-run` lists what it would send.

### 6. Deploy

```bash
vercel deploy --prod
```

Vercel installs the locked dependencies, runs `next build` on Linux with Node 24 and publishes
the result. The build needs no database and no secret: every page is rendered per request, and
nothing connects to Turso or Blob until a visitor arrives.

**The link to share is the project's production domain** (the `*.vercel.app` name under
**Domains** on the project page). With Deployment Protection on its recommended scope
("Standard Protection", project **Settings**, **Deployment Protection**), every other URL, such
as the long per-deployment `…-hamza-tahirrs-projects.vercel.app` links, asks for a Vercel login;
production domains stay public.

### 7. Check the hosted site

- `/login` shows the plain email and password form (no sample-account panel).
- Log in as `customer@example.com` with the shared password; the dashboard, requests and photos
  load.
- A page with a map (for example `/request` as the customer) shows the map; its worker script
  comes from `/vendor/maplibre-gl/6.11.2/maplibre-gl-worker.mjs`.
- Upload a profile picture on `/account/photo`; it appears after saving.

## Signing in on the hosted site

The one-click **"Log in as …"** buttons are local-only by design: the sample accounts include
the admin, so the buttons appear only when `DEMO_MODE` is on **and** the page is opened on
`localhost`, and the server action refuses every other address too. On the hosted site the login
page is the normal form. Type a sample email and the shared password **`repair-pilot-2026`**:

| Email | Shows |
| --- | --- |
| `customer@example.com` | a customer with requests, quotes, a reservation and finished jobs |
| `mechanic@example.com` | an approved mechanic: job board, quoting, bookings, gallery |
| `admin@example.com` | the admin console: approvals, matching, settings, help desk, audit log |

The README's sample-account table lists the rest. New visitors can also create their own
customer or mechanic account on `/signup`.

Anyone who has the link and the shared password can sign in as any sample account, the admin
included. Share the link with people you trust, and [refresh the sample data](#refreshing-the-sample-data)
to undo their changes.

## Limits on the hosted site

| Limit | Why | What visitors see |
| --- | --- | --- |
| **4 MB of files per form** (`HOSTED_UPLOAD_MAX_BYTES`) | Vercel rejects request bodies over 4.5 MB (`413 FUNCTION_PAYLOAD_TOO_LARGE`) | Photos are shrunk in the browser before they are sent (longest side at most 2048 px, about 1 MB each), so photo uploads just work. A video or PDF must be under 4 MB; larger files, or a set that will not fit, get a clear message before anything is sent. |
| Locally the full limits apply | no platform limit | photos 8 MB each, request video 40 MB, documents 10 MB |
| Files over 4 MB are not streamed | Vercel responses are capped at 4.5 MB too | after the same permission check, `/api/files/[id]` redirects to a signed Blob link valid for 15 minutes |
| 60 seconds per request | `vercel.json` caps all functions (Hobby allows up to 300 s) | a stuck request ends instead of using up the monthly CPU allowance |
| One function region (`bom1`) | Hobby plan | fast from Pakistan and India; static files come from Vercel's CDN worldwide |
| Runtime logs kept 1 hour | Hobby plan | look at errors soon after they happen (project, **Logs**) |

Per-IP limits (failed logins, sign-ups) work as intended on Vercel: the app reads the first
`X-Forwarded-For` address, and Vercel overwrites that header with the real client address
(a value sent by the client is never passed through). The session cookie is `HttpOnly`,
`SameSite=Lax` and `Secure` in production, which suits the HTTPS-only `*.vercel.app` domains.

## Refreshing the sample data

Sample dates are relative to the moment of seeding, so refresh now and then, and after people
have tried things out:

```bash
npm run db:reset
npm run db:push:remote
npm run uploads:push:remote
```

No redeploy is needed. Everything created on the hosted site since the last push (accounts,
requests, quotes, uploads) is replaced by the fresh sample data; files people uploaded there stay
in the Blob store but are no longer shown.

`npm run db:reset` also resets the local database that the server on this laptop uses. To leave
that alone, seed a separate copy and push it: the scripts read `DATABASE_PATH` and `UPLOAD_DIR`.

```bash
export DATABASE_PATH=.data/hosted.db UPLOAD_DIR=.data/hosted-uploads
npm run db:reset && npm run db:push:remote && npm run uploads:push:remote
unset DATABASE_PATH UPLOAD_DIR
```

## Updating the code

Run the checks, then deploy again:

```bash
npm run typecheck && npm run lint && npm test
NEXT_DIST_DIR=.next-check npx next build   # trial build that leaves .next (npm start) alone
rm -rf .next-check
vercel deploy --prod
```

A schema change (a new `db/migrations/NNNN_*.sql`) must reach the hosted database right before
`vercel deploy --prod`, in one of two ways:

- `npm run db:migrate:remote` applies the new migrations to the hosted database and keeps its
  data;
- or a full refresh (`npm run db:reset`, then `npm run db:push:remote`) replaces it with fresh
  sample data.

`vercel deploy` without `--prod` makes a preview deployment. If the Turso and Blob variables are
also connected to the Preview environment, previews use the same hosted database and store as
production.

## Keep hosted credentials out of the local app

`npm run dev`, `npm run build` and `npm start` load `.env.local`, and `next build` and
`next start` also load `.env.production.local` and `.env.production`. Hosted credentials in any
of those files would point the local app, including the server on port 3000, at the hosted
database and Blob store. So:

- `.env.local` contains only `DEMO_MODE=true`.
- Hosted credentials live in the Vercel project and, for the push scripts, in `.env.vercel`.
- Never create `.env.production` or `.env.production.local`.
- Every `.env*` file except `.env.example` is git-ignored and excluded from `vercel deploy`
  uploads (`.vercelignore`).

### Vercel CLI side effects on this laptop

- Commands that link the folder or connect a resource (`vercel link`, `vercel blob …`,
  `vercel integration add …`) can download the project's variables into `.env.local` and append
  `.env*` to `.gitignore`. Pass `--no-env-pull` where the command offers it
  (`vercel <command> --help`). Afterwards check that `.env.local` still contains only
  `DEMO_MODE=true` and remove any lines the CLI appended to `.gitignore` (it already ignores
  `.env*` and `.vercel`).
- `vercel env pull` writes `.env.local` unless you give it a file name: always pass
  `.env.vercel`.

## How the build is set up

| File | What it does for Vercel |
| --- | --- |
| `vercel.json` | Framework `nextjs`; functions in `bom1`; Fluid compute on (the default for new projects); `maxDuration` 60 s for every app function (`src/app/**`). No cron jobs. |
| `package.json` `engines.node` = `24.x` | Vercel builds and runs with the latest Node.js 24 (Node 20 builds fail from 1 October 2026). Vercel reads `engines`; `.nvmrc` and `.node-version` (`24.21.0`) are for local tools. |
| `next.config.ts` | Keeps better-sqlite3, sharp and @libsql/client out of the bundle (`serverExternalPackages`); adjusts which files go into each function (below); keeps the security headers; `NEXT_DIST_DIR` support. The 90 MB body limits there apply only to local runs. |
| `.vercelignore` | Keeps `.tools` (portable Node, over 100 MB), `.data`, env files, tests, reports and build folders out of `vercel deploy` uploads. |

A function on Vercel contains only the files the build traced for it (the database and uploads
are reached over the network). `next.config.ts` corrects the traces in three places:

- **MapLibre worker files** (`outputFileTracingIncludes`): `/vendor/maplibre-gl/...` reads two
  files from `node_modules/maplibre-gl` at runtime, the only files the hosted app reads from
  its own disk.
- **sharp's libvips** (`outputFileTracingIncludes`, every route): sharp's native add-on loads
  the libvips library at runtime, which the tracer cannot see. Without it sharp fails to load
  and photo uploads break, so the installed `@img/sharp-*` packages go into every function (on
  Vercel: `sharp-linux-x64` and `sharp-libvips-linux-x64`).
- **libsql's native add-ons** (`outputFileTracingExcludes`, every route): libsql picks its add-on
  with a computed `require()`, which the tracer expands to every installed `@libsql` package,
  including the unused `@libsql/kysely-libsql`. The hosted app talks to Turso over HTTP and never
  loads them, so they are left out (about 30 MB per function on Linux).

**Checked on this laptop** (5 October 2026) with a trial build (`NEXT_DIST_DIR=.next-platform`,
`DATABASE_PATH` pointing to a file that does not exist, no hosted variables):

- The build completes, lists all 39 routes as dynamic (`ƒ`) and never creates the database
  file, so it needs no database and no secrets.
- Routes were packed the way Vercel packs a function (only the files in each route's
  `.nft.json`, copied into an empty folder). The MapLibre worker route has its three files;
  `@libsql/client/web` and sharp load from the packed copies, and sharp re-encodes a test image
  there. Functions are about 27 MB (19 MB of it Windows' libvips), far below Vercel's 250 MB.
- `next start` on that build with `DEMO_MODE=false`: `/login` and `/signup` show no sample
  panel at desktop and phone widths, a typed sample login works, and the map loads its worker.
  With `DEMO_MODE=true` the panel appears for `localhost` only, never for a `*.vercel.app` or
  LAN address. The same build also ran on the libSQL driver with a local `file:` URL.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Pages fail with "The database at libsql://… has no schema" | The hosted database is empty: run `npm run db:push:remote`. |
| Uploads fail with "File storage is not configured" | No Blob store is connected for this deployment's environment. Connect `wrenchmatch-uploads` to the project and redeploy. |
| "These files add up to … more than … one upload can carry on this site" | The hosted 4 MB per-form limit. Send fewer files at once, or a shorter video. |
| `413 FUNCTION_PAYLOAD_TOO_LARGE` | A request over 4.5 MB got past the browser check (for example with JavaScript off). Same fix. |
| Opening the link asks for a Vercel login | That is a protected per-deployment URL. Share the production domain instead. |
| Logged out again right after logging in | The session cookie is `Secure` in production: use the `https://` address. |
| A variable change has no effect | Variables are read when a deployment is made: run `vercel deploy --prod`. |
| Maps show "Map unavailable" | The map tiles come from OpenFreeMap over the internet. Check that `/vendor/maplibre-gl/6.11.2/maplibre-gl-worker.mjs` returns JavaScript. |
| A feature stops working for days | A Hobby allowance ran out (project, **Usage**). It comes back after the 30-day window, or move to Pro. |
