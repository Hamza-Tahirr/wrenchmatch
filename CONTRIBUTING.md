# Contributing to WrenchMatch

`docs/ARCHITECTURE.md` is the build contract (schema, module paths, privacy matrix, states,
routes); read it before changing behavior. `MVP_PLAN.md` is the product plan.

## Toolchain

The project uses **Node.js 24 LTS** (`.nvmrc`). Next.js 16 is newer than most references online:
check `node_modules/next/dist/docs/` before relying on an API or config option, and heed its
deprecation notices.

On the original Windows laptop the system Node is 26, so a portable Node 24 sits in `.tools/`
(git-ignored). Put it first on `PATH` in every new terminal:

- Bash: `export PATH="/d/Vs code projects/Demo/.tools/node-v24.21.0-win-x64:$PATH"`
- PowerShell: `$env:PATH = "D:\Vs code projects\Demo\.tools\node-v24.21.0-win-x64;" + $env:PATH`

## Rules that are easy to get wrong

- Server code lives in `src/server/**` and starts with `import "server-only"`. Domain functions
  take `(ctx, viewer, input)`; they never read cookies, env or the system clock.
- Authorization is enforced in the server data-access layer (no RLS in SQLite). Every query is
  scoped to the viewer; unauthorized reads return "not found".
- Money is integer cents; compute it only in `src/server/pricing.ts`.
- Never put uploads under `public/`; files are served only by `src/app/api/files/[id]`.
- Stripe is not connected: no card inputs, no webhook route, no simulated payment, and nothing may
  move a booking past `pending_payment` (a database trigger enforces this).
- Presentation mode: the UI shows no "DEMO"/"demo" labels, banners or watermarks. Seeded records
  keep `is_demo_fixture = 1` internally so integrity rules still apply. Honesty rules still hold:
  never fake a payment or show anything as paid online ("Online payments are coming soon",
  checkout stays disabled); ratings come only from genuine (non-fixture) reviews, otherwise "New";
  seeded reviews are never shown to other users as genuine; identity and insurance document
  images stay marked "SAMPLE".
- Schema changes go in a new `db/migrations/NNNN_*.sql` file, then `npm run db:types`.
- Never commit credentials. Hosted secrets live only in the Vercel project settings and in the
  git-ignored `.env.vercel`; `.env.local` holds only `DEMO_MODE`. The credential guard in
  `.githooks` (`scripts/check-secrets.mjs`, switched on by `npm install`) refuses commits and
  pushes that contain one; never bypass it (see `SECURITY.md`).

## Workflow

1. Branch from `main`; keep `npm run typecheck`, `npm run lint` and `npm test` green
   (`npm run test:libsql` too when database code changes, `npm run test:e2e` for flow changes).
2. Open a pull request. The template lists the checks, and CI runs a credential scan,
   typecheck, lint, both test suites and a production build. `main` only takes changes whose
   CI passed.
3. After merging, publish with `vercel deploy --prod` (see `docs/DEPLOY.md`).

## Commands

`npm run db:reset` · `npm run dev` (port 3000) · `npm run typecheck` · `npm run lint` ·
`npm test` · `npm run test:libsql` · `npm run build` · `npm run test:e2e` · `npm run secrets:check`
