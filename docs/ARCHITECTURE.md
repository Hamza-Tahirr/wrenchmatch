# WrenchMatch demo — architecture and build contract

WrenchMatch is a working name for the local-first car-repair marketplace MVP described in
`MVP_PLAN.md` and the original product brief. This document is the contract every module is
built against: table names, module paths, function signatures, privacy rules and states.
Change it only together with the code that depends on it.

This is a **development/demo build**. It is not a licensed live marketplace. Payments,
licensing, tax, insurance verification, real email delivery and production security
review are **not** complete.

## 1. Stack and the SQLite decision

The original brief asked for local Supabase (Postgres/PostGIS, Auth, Storage, RLS) via
Docker Desktop. Docker Desktop's installation on this machine is incomplete (its installer
never finished; no registry keys; it exits on launch), and the project owner chose
**SQLite for the time being**. Each Supabase piece has a small local replacement behind a
module boundary so the later move to hosted Supabase is a swap, not a rewrite:

| Concern | Supabase plan | This build (SQLite) | Later swap |
| --- | --- | --- | --- |
| Database | Postgres + SQL migrations | SQLite (`better-sqlite3` 13, WAL) + SQL migrations in `db/migrations` | Port migrations to Postgres; Kysely has a Postgres dialect |
| Typed queries | generated Supabase types | Kysely 0.29 + `src/server/db/schema.generated.ts` generated from the SQLite schema (`npm run db:types`) | Regenerate from Postgres |
| Geo radius | PostGIS `ST_DWithin` | Haversine distance in `src/server/matching/geo.ts` over approximate ZIP centroids | PostGIS geography + GiST |
| Auth | Supabase Auth | App sessions: scrypt password hashes (`node:crypto`), random session tokens stored as SHA-256 digests, httpOnly cookie | Supabase Auth + SSR cookies |
| Authorization | RLS + grants | Server data-access layer: every query takes a `Viewer` and scopes rows/columns; DB constraints/triggers enforce invariants | Add RLS policies as a second check |
| Private files | private Storage buckets | Files under `.data/uploads` (outside `public/`), streamed only by `GET /api/files/[id]` after a policy check | Private buckets + signed URLs |
| Email capture | Supabase Mailpit | `email_outbox` table shown in the admin "Dev mailbox" | Custom SMTP provider |

Versions (pinned in `package.json`, checked 1 Oct 2026): Next.js 16.3.8 (patched release
for the 30 Sep 2026 security advisory), React 19.3.0, TypeScript 6.0.3 (strict), Node.js 24
LTS (24.21.0), Tailwind CSS 4.3.3, ESLint 9.39.5 + eslint-config-next 16.3.8 (ESLint 10 is
excluded by eslint-plugin-react's peer range), Zod 4.6.5, sharp 0.35.5, Vitest 5.0.3,
Playwright 1.63.0 (installed Google Chrome via `channel: "chrome"`), tsx 4.23.15.

**Next.js 16 is newer than most training data.** Read `node_modules/next/dist/docs/` before
using an API (see `CONTRIBUTING.md`). Notable: `params`/`searchParams`/`cookies()`/`headers()` are
async; `middleware.ts` is now `proxy.ts` (this app's `src/proxy.ts` makes no access
decision: it only forwards the requested path to the protected layouts, see section 9);
Turbopack is the default bundler; `next lint` no longer exists (use `npm run lint`).

## 2. Directory layout and ownership

```
db/migrations/NNNN_name.sql        SQL source of truth (applied in order, tracked in schema_migrations)
docs/                              ARCHITECTURE.md (this), PAYMENTS.md (Stripe boundary)
scripts/                           db-migrate.ts, db-reset.ts, seed.ts (+ scripts/seed/*), gen-db-types.ts
src/app/                           routes (see section 10)
  (public)/...                     landing, help, login, signup
  (customer)/...                   request, quotes, requests/[id], bookings, account
  (mechanic)/mechanic/...          apply, profile, jobs, jobs/[requestId], bookings/[id]
  (admin)/admin/...                dashboard and tools
  notifications/, support/         shared signed-in pages (support: customers and mechanics)
  api/files/[id]/route.ts          authorized file streaming
src/proxy.ts                       forwards the requested path (x-wm-path) to protected layouts; no auth logic
src/components/ui/                 design system (buttons, fields, cards, badges, tables, dialogs...)
src/components/layout/             header, navigation, footer, demo banner
src/lib/                           code safe for client AND server (formatting, constants, zod schemas)
src/server/                        server-only modules (`import "server-only"` at the top)
  db/        client.ts, migrate.ts, tx.ts, schema.generated.ts
  auth/      password.ts, session.ts, viewer.ts, rate-limit.ts
  storage/   local-storage.ts, uploads.ts (validation + sanitizing), file-access.ts (policy)
  matching/  geo.ts, rules.ts (pure), run.ts (DB orchestration)
  catalog/   read-only reference data for forms (enabled categories, pilot ZIP lookup)
  customer/  customer commands + queries (requests, quote comparison, reservations, post-booking, account)
  mechanic/  mechanic commands + queries (application/profile, job board, quotes, demo bookings)
  admin/     admin commands + queries (approvals, settings, diagnostics, marketplace, audit, mailbox, help desk)
  support/   help/dispute requests raised by customers and mechanics
  notifications/notify.ts, audit.ts, pricing.ts, payments/, errors.ts, clock.ts, ids.ts, config.ts, context.ts
tests/unit, tests/integration, tests/e2e, tests/support
```

Route-group folders hold slice-specific components in `_components/` subfolders.

## 3. Server conventions

* **Context injection.** Domain functions take `(ctx: AppContext, viewer: Viewer, input)`.
  `AppContext = { db: Kysely<DB>; now: Date; storage: FileStorage }`, created per request by
  `createAppContext()` in `src/server/context.ts`. Tests build their own context with a temp
  database, a fixed `now` and a temp upload directory. Domain code never reads cookies,
  `process.env` or the system clock directly.
* **Viewer.** `type Viewer = { id: string; role: "customer" | "mechanic" | "admin"; email: string; displayName: string }`.
  Pages and Server Actions obtain it with `requireRole(...)` from `src/server/auth/viewer.ts`;
  domain functions **re-check** role and ownership themselves (defense in depth).
* **Errors.** Domain functions throw `DomainError(code, userMessage)` from `src/server/errors.ts`.
  Codes include `not_found` (also used for "exists but you may not see it", so ids cannot be
  probed), `forbidden`, `invalid_input`, `conflict`, `slot_conflict`, `quote_expired`,
  `mechanic_not_eligible`, `payment_not_connected`, `rate_limited`. `mapDbError(e)` converts
  SQLite trigger messages (`RAISE(ABORT, 'slot_conflict')` etc.) and unique-constraint
  failures into `DomainError`s.
* **Transactions.** Every multi-row state change runs inside `writeTx(ctx.db, async (trx) => ...)`
  from `src/server/db/tx.ts`, which issues `BEGIN IMMEDIATE` so concurrent writers serialize.
  Expire stale rows (`expireStaleRecords(trx, now)`) at the start of transactions that
  depend on expiry.
* **DTOs.** Queries return purpose-built objects with explicit column lists. Never
  `selectAll()` from a table that has private columns, and never pass raw rows to Client
  Components. Money stays integer cents until formatted in the UI.
* **Server Actions** live next to their routes (`actions.ts`, `"use server"`). Each one:
  `requireRole` → parse `FormData` with a Zod schema from `src/lib/validation/*` → call a
  domain function with `createAppContext()` → `revalidatePath` / `redirect`, or return a
  typed form state `{ ok: false, formError?, fieldErrors? }` for `useActionState`.
* **Time.** Timestamps are UTC ISO strings (`toISOString()`); calendar dates `YYYY-MM-DD`.
  Each pilot ZIP has an IANA time zone; requests copy it. Mechanic slot inputs
  (`datetime-local`) are interpreted in the request's time zone (`src/lib/time.ts`
  provides zone-aware conversion and formatting without external libraries).
* **IDs** come from `newId()` (`crypto.randomUUID()`).

## 4. Data model

`db/migrations/0001_init.sql` is authoritative. Summary:

* `users` (role immutable by trigger; `is_demo_account`), `sessions`, `rate_limits`.
* `files` — every private upload; images must be metadata-stripped (CHECK).
* `service_categories` (12 rows seeded by the migration; `enabled`, `safety_sensitive`),
  `zip_centroids`, `pilot_zips` (configurable pilot area; Phoenix is seed data only).
* `mechanic_profiles` (public/display fields + status), `mechanic_private` (legal/business
  name, phone, contact email, garage address, policy number), `mechanic_makes`,
  `mechanic_services` (`safety_approved` per category), `mechanic_availability` (weekly
  windows, minutes from local midnight, 0 = Sunday), `mechanic_documents`.
* `repair_requests` (coarse, shareable fields), `request_private` (contact, exact address,
  consent snapshot), `request_media` (`shareable_before_booking` only for sanitized photos).
* `match_evaluations` (every candidate with reason codes), `job_matches` (notified mechanics).
* `quotes` + `quote_items` (immutable terms; one active quote per mechanic per request;
  trigger blocks overlapping committed slots).
* `bookings` — one per request and per quote; created `pending_payment`; immutable money
  and snapshots; triggers block any move past `pending_payment` (Stripe not connected).
  Only `is_demo_fixture = 1` rows can be confirmed/in progress/completed.
* `change_orders`, `invoices`, `reviews` (fixture reviews never count toward ratings).
* `notifications`, `email_outbox` (local capture only), `audit_events` (append-only).
* `support_requests` (migration 0002): help/dispute requests from customers and mechanics,
  optionally linked to one of their own requests or bookings; admins resolve them with a note.

## 5. State machines

| Record | States | Allowed transitions (enforced by triggers) |
| --- | --- | --- |
| Mechanic | applied, under_review, approved, rejected, suspended | applied→under_review/approved/rejected; under_review→approved/rejected; approved→suspended; suspended→approved/rejected; rejected→applied. Reason required for rejected/suspended. Approval requires recorded insurance; the approval command also checks it is unexpired. |
| Request | draft, open, quoted, reserved, booked, expired, cancelled | draft→open (submit + matching) / cancelled; open→quoted/expired/cancelled; quoted→open (all quotes gone) / reserved / expired / cancelled; reserved→booked (payment phase only) / cancelled. `reserved`/`booked` require the booking row. Requests expire 7 days after submission. |
| Quote | submitted, withdrawn, expired, selected, declined | submitted→withdrawn (mechanic) / expired (clock) / selected (customer) / declined (another quote selected or request cancelled); selected→declined (reservation cancelled). Terms immutable. `expires_at <= slot_start_at`. |
| Booking | pending_payment, confirmed, in_progress, completed, cancelled, disputed | pending_payment→cancelled only (payment not connected). confirmed→in_progress/cancelled/disputed; in_progress→completed/cancelled/disputed; completed→disputed. |
| Change order | proposed, approved, rejected, void | proposed→approved/rejected/void; approved→void. Payment for approved change orders is blocked (Stripe not connected). |

Selecting a quote (`selectQuote`) runs in one `BEGIN IMMEDIATE` transaction: expire stale
records; load request (must belong to viewer, status `open`/`quoted`, not expired), quote
(`submitted`, unexpired, belongs to request) and mechanic (still approved, accepting jobs,
insurance unexpired); recompute money from `quote_items` with `src/server/pricing.ts` and
check it equals the stored quote totals; insert the booking (`pending_payment`, snapshot
JSON of the quote + items + mechanic display info + totals, consent snapshot); mark the
quote `selected`, other submitted quotes `declined`, request `reserved`; notify; audit.
`UNIQUE(bookings.request_id)` and `UNIQUE(bookings.quote_id)` make a second concurrent or
repeated selection fail even if application checks were bypassed. A repeat selection of the
same quote by the same customer returns the existing booking (idempotent double click).

Submitting a quote (`submitQuote` in `src/server/mechanic/quotes.ts`) also runs in one
`BEGIN IMMEDIATE` transaction: the mechanic must hold a job match for the request (and not
have passed on it), be approved, accepting jobs and, for a safety-sensitive category,
safety-approved; the request must still be open for quotes and the mechanic must not have
another active quote on it. **Insurance must be on file and valid through today, the
request's preferred date and the day of the offered slot** (all in the request's time zone);
otherwise the quote is refused with `mechanic_not_eligible` (`insurance_expired`) and a
message to renew the insurance or offer an earlier time. The offered slot must fit the
request's service mode and not overlap the mechanic's other committed slots (also enforced by
a trigger). `selectQuote` re-checks insurance for today and the slot day, so a quote whose
mechanic's insurance lapses before the job can no longer be reserved.

## 6. Matching rules (`src/server/matching`)

`rules.ts` is pure and unit-tested; `run.ts` loads candidates, evaluates them, writes
`match_evaluations` and `job_matches`, sets `repair_requests.matched_count` and notifies.
Inputs: the request's ZIP-centroid point, category, make, service mode, garage distance,
preferred date (weekday) and window; each mechanic's status, services, makes, availability,
insurance expiry and base point. Reason codes (a mechanic is eligible only with none):

`status_not_approved` · `suspended` · `not_accepting_jobs` · `insurance_missing` ·
`insurance_expired` · `category_not_offered` · `safety_category_not_approved` ·
`make_not_supported` · `mode_mismatch` · `out_of_range` · `no_availability`

* Distance: haversine miles between ZIP centroids (approximate; documented in the UI).
* Mobile request: mechanic mode `mobile`/`both` and distance ≤ mechanic travel radius.
  Garage request: mode `garage`/`both` and distance ≤ request `max_garage_distance_miles`.
  `either`: whichever applies (mobile preferred when both fit).
* Availability windows: morning 08:00–12:00, afternoon 12:00–17:00, evening 17:00–20:00;
  a mechanic window on the preferred weekday must overlap; `flexible` needs any window in
  the week.
* Insurance is valid when `insurance_expires_on >= ` the request's preferred date and ≥ today.
* Eligible mechanics are sorted by distance; at most `MAX_MECHANICS_NOTIFIED` (5) closest
  are notified. `matched_count` is the **actual** number notified. Zero is a real state with
  an honest empty-state UI and an admin follow-up path.
* Category disabled or ZIP not in an enabled pilot ZIP → the request is rejected at
  validation with a clear message (it never reaches matching).

## 7. Pricing (`src/server/pricing.ts`, the only place money is computed)

* Quote items: `labor`, `part`, `tax`, `fee`; `amount = quantity × unit_price` (integer cents).
* Quote totals: labor, parts, tax, fee, `total = sum`. Recomputed on the server from saved
  items; a browser-supplied total is never accepted (no action schema has a total field).
* Platform fee: **provisional 10% of labor** (`PLATFORM_FEE_BPS = 1000`),
  `fee = floor((labor × bps + 5000) / 10000)` (round half up). It is **included** in the
  customer total and deducted from the mechanic payout (destination-charge model in
  `MVP_PLAN.md`): `mechanic_payout = total − platform_fee`, before payment-processing costs
  (to be decided when Stripe is connected). The DB re-checks this formula with CHECKs.
* Invoices (demo fixtures): quote totals plus approved change orders; platform fee on the
  combined labor.

## 8. Privacy matrix (enforced in queries and in `file-access.ts`)

| Data | Owner customer | Matched mechanic before confirmed booking | Unmatched / other mechanic | Mechanic on a confirmed (demo) booking | Admin |
| --- | --- | --- | --- | --- | --- |
| Request coarse fields (category, vehicle, description, area label, preferred date/window, drivable, mode) | yes | yes | no | yes | yes |
| Sanitized request photos | yes | yes | no | yes | yes |
| Request video | yes | **no** | no | yes | yes |
| Contact email/phone, exact address | yes | **no** | no | yes | via audited "reveal" |
| Quotes on the request | all on own requests | own quote only | no | own | yes |
| Mechanic public profile (display name, experience, certifications, services, approximate area, genuine rating or "New", profile photo) | if the mechanic quoted on their request or is booked | own | — | own | yes |
| Mechanic private (legal/business name, phone, email, garage address, policy number) | **no** before confirmed booking; phone/email (+ garage address for garage jobs) after | own | no | own | via audited "reveal" |
| Mechanic ID/insurance documents | no | own | no | own | yes (each view audited) |

Unauthorized reads return "not found", never "forbidden", so ids cannot be probed. Ratings
shown to customers count only non-fixture reviews; with none, show **"New"**. Demo-fixture
reviews are shown separately and labelled as not counted.

"Confirmed booking" in this matrix means a booking that is **confirmed, in progress,
completed or disputed**. A booking can only become disputed after it was confirmed, so the
booked mechanic of a disputed booking keeps the customer's contact details, exact address,
photos and video (`CONTACT_VISIBLE_STATUSES` and `MEDIA_VISIBLE_STATUSES` in
`src/server/mechanic/bookings.ts` equal `BOOKED_MEDIA_STATUSES` in `file-access.ts`) while
an admin reviews the dispute. Pending-payment and cancelled bookings grant nothing beyond the
matched-mechanic column. A matched mechanic sees shared request photos only while approved:
a suspended (or otherwise unapproved) mechanic loses them, together with the job details.

Maps and location displays (when shown) use only approximate points: the request's ZIP
centroid and the mechanic's base-ZIP centroid, never an exact address, and only where the
viewer may see that record under this matrix.

## 9. Auth, files, notifications, payments

**Auth** (`src/server/auth`): scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte key) via
`node:crypto`, constant-time verify; session token = 32 random bytes (base64url) in cookie
`wm_session` (httpOnly, SameSite=Lax, `Secure` in production, 7-day expiry); DB stores
`sha256(token)`. Signup offers **customer** or **mechanic** only; admins exist only through
the seed. Failed logins show a generic message. Rate limits (fixed window in `rate_limits`):
login 5 failures per email and 20 per IP per 15 min; signup 5 per IP per hour; request
submission 10 per customer per hour; quote submission 30 per mechanic per hour. Local
development auto-verifies new emails (documented; hosted Supabase must enforce
verification).

**One-click demo login (`DEMO_MODE` only).** With `DEMO_MODE=true` the login page lists the
seeded demo accounts (`src/server/auth/demo-accounts.ts`) with a "Log in as ..." button each.
The button posts only the account's email to `demoLoginAction` (localhost requests only),
which signs in through `logInDemoAccount` (`src/server/auth/login.ts`): it accepts only listed,
seeded sample accounts (`is_demo_account = 1`) and always checks the public sample password
against the stored hash, so it can never do more than typing that password could. It neither
counts toward nor is blocked by the per-email and per-IP failed-login limits (it never guesses
passwords), and it does not clear a lockout earned by typed attempts; disabled accounts and
session handling work as in a typed login. With `DEMO_MODE=false` the panel is not rendered and
the action ignores every email. It must never be enabled for real accounts.

**Route protection.** Pages and Server Actions call `requireRole(role, path)`; domain
functions re-check. Because most pages have a `loading.tsx`, a redirect thrown by the page
itself would happen after the shell streams (HTTP 200 plus a client-side redirect). Layouts
that protect a whole subtree therefore check first with `requireRoleForSubtree` /
`requireViewerForSubtree` (`src/server/auth/viewer.ts`): `/mechanic/**` (mechanic),
`/admin/**` (admin), `/quotes`, `/requests/[id]/**`, `/bookings/**`, `/account` (customer),
`/notifications` (any signed-in role) and `/support` (customer or mechanic). Signed-out
visitors get a real `307` to `/login?next=<the exact path and query>`, other roles a `307` to
`/access-denied?need=<role>&from=<path>`. Layouts cannot see their own path, so
`src/proxy.ts` forwards it in the `x-wm-path` request header for those areas; the value is
sanitized like any `next` parameter and never used for authorization. Because the proxy also
runs on `/mechanic/**`, where the application and profile forms post multipart uploads,
`next.config.ts` raises `experimental.proxyClientMaxBodySize` to `90mb` (the same transport
cap as `serverActions.bodySizeLimit`): at the 10 MB default Next.js buffers only the first
10 MB of a request body that passes the proxy, and a larger upload would arrive truncated.
`/request` (photos and video) is not in the proxy matcher. `/request` stays
public: signed-out visitors see the sign-up / log-in panel, other roles a "not available for
your account" panel. `/requests` redirects to `/quotes`.

**Files** (`src/server/storage`): `FileStorage` interface (`put`, `read`, `remove`) with a
local-disk implementation rooted at `UPLOAD_DIR` (default `.data/uploads`). Keys are
generated (`<purpose>/<yyyy>/<uuid>.<ext>`), never user-supplied. Validation by magic bytes
and size, not by the browser's MIME type:

| Purpose | Types | Limit | Processing |
| --- | --- | --- | --- |
| Request photo | JPEG, PNG, WebP (HEIC rejected with "convert to JPEG" message) | 8 MB each, max 5 | decode with sharp, auto-rotate, resize to ≤ 2048 px, re-encode JPEG; all EXIF/GPS/ICC metadata removed |
| Request video | MP4, MOV, WebM | 40 MB, max 1 | stored as uploaded; **never shown to mechanics before a confirmed booking** (metadata cannot be stripped without ffmpeg) |
| Mechanic profile photo | JPEG, PNG, WebP | 5 MB | re-encoded ≤ 512 px, metadata removed |
| Mechanic document (ID, insurance, certification) | PDF, JPEG, PNG, WebP | 10 MB each | images sanitized; PDFs stored as-is; owner + admin only |

`GET /api/files/[id]` requires a session, calls `canViewFile(ctx, viewer, fileId)` (single
policy function implementing section 8), returns 404 when not allowed, and streams with
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and
`Content-Disposition: attachment` for PDFs. No file is ever placed under `public/`.

**Notifications**: `notify(trx, { userId, type, title, body, linkPath, email? })` writes an
in-app notification and (optionally) an `email_outbox` row in the same transaction. Bodies
contain no contact details or exact addresses. `linkPath` is an app-relative path that the
recipient's role can open (customers `/requests`, `/bookings`, `/support`, `/request`;
mechanics `/mechanic/...`, `/support`; admins `/admin/...`). Types by recipient:

| Recipient | Types |
| --- | --- |
| Customer | `account.welcome`; `request.submitted` / `request.no_match` (with the actual matched count); `request.rematched` (admin re-ran matching); `quote.received`, `quote.withdrawn`; `booking.reserved` (pending payment); `booking.started`, `booking.completed`; `change_order.proposed`, `change_order.withdrawn`; `invoice.issued`; `booking.demo_cancelled`, `booking.demo_disputed`; `support.received`, `support.resolved` |
| Mechanic | `account.welcome`; `job_matched`; `quote.selected` (reserved, awaiting payment), `quote.declined`; `request.cancelled`, `booking.cancelled` (reservation cancelled); `change_order.approved`, `change_order.rejected`; `review.received`; `mechanic.application_received`; `mechanic.review_started`, `mechanic.approved`, `mechanic.rejected`, `mechanic.suspended`, `mechanic.reinstated`; `mechanic.document_verified`, `mechanic.document_rejected`; `mechanic.safety_approved`, `mechanic.safety_approval_removed`; `booking.demo_cancelled`, `booking.demo_disputed`, `booking.demo_payout_held`, `booking.demo_payout_released`; `support.received`, `support.resolved` |
| Admins (every active admin) | `mechanic.application_submitted`, `mechanic.application_resubmitted`; `mechanic.document_uploaded`; `mechanic.safety_review_requested` (a mechanic added a brake/suspension service); `admin.request_no_match`; `support.created` |

Mechanic invitations (`inviteMechanic`) are captured as dev-mailbox emails only, since the
invitee has no account yet.

**Help desk** (`support_requests`, migration 0002; `src/server/support/requests.ts` and
`src/server/admin/support.ts`): customers and mechanics open help or dispute requests on
`/support` with a topic (problem with a booking, cancellation, question about a quote,
dispute, safety concern, account, something else) and a 10-2000 character message (the
form's `?requestId=` / `?bookingId=` prefill links it), optionally linked to one of their
own repair requests or bookings (for a mechanic: a request they were matched to or a booking
they work on; other ids are refused). Every active admin gets `support.created` (no personal
data), the requester `support.received`. Admins work the queue on `/admin/support` and
resolve a request with a note (open → resolved only, enforced by a trigger), which notifies
the requester (`support.resolved`) and is audited. Disputes on demo bookings are handled with
the admin interventions in section 10.

**Audit** (`src/server/audit.ts`): `recordAudit(trx, { actor, action, entityType, entityId, reason?, metadata? })`
for every admin action, quote selection, reservation cancellation, booking state change,
admin reveal of private data and document view.

**Payments** (`src/server/payments`, see `docs/PAYMENTS.md`): a typed `PaymentGateway`
interface (checkout for a booking, Connect onboarding link, verified-event handling, refund,
payout status) with one implementation, `notConnectedGateway`, whose every method returns
`{ ok: false, reason: "stripe_not_connected" }`. There is **no** webhook route, no card
input, no simulated success. UI shows "Payments coming soon — Stripe not connected".

## 10. Routes (the eight navigation areas)

| Area | Routes | Who |
| --- | --- | --- |
| 1. Landing | `/` (one primary CTA **Find a Mechanic** → `/request`) | everyone |
| 2. Request repair | `/request` | customer (signed-out visitors are sent to sign up / log in and returned) |
| 3. Quotes | `/quotes` (my requests + quote counts), `/requests/[id]` (status, actual match count, quote comparison, select) | customer |
| 4. Booking / payment preview | `/bookings`, `/bookings/[id]` (pending reservation breakdown, platform fee, consent record, "Stripe not connected"; demo fixture detail with contact reveal, change orders, invoice, review) | customer |
| 5. Customer account | `/account` (requests, quotes, pending reservations, demo bookings, invoices, change-order approvals, reviews) | customer |
| 6. Mechanic signup / profile | `/signup?role=mechanic`, `/mechanic/apply`, `/mechanic/profile` (fields, documents, availability, status) | mechanic |
| 7. Mechanic job board | `/mechanic/jobs`, `/mechanic/jobs/[requestId]` (Interested, quote form, withdraw), `/mechanic/bookings/[id]` (demo fixtures: start, complete, change order, invoice, payout status) | approved mechanic (others see their status) |
| 8. Admin dashboard | `/admin`, `/admin/mechanics`, `/admin/mechanics/[id]`, `/admin/requests`, `/admin/requests/[id]`, `/admin/matching`, `/admin/marketplace`, `/admin/settings`, `/admin/support`, `/admin/audit`, `/admin/mailbox` | admin |

Shared: `/login`, `/signup`, `/help` (FAQ, demo guide listing the eight areas and demo
logins, demo terms/privacy text), `/notifications`, `/support` (customers and mechanics:
raise and track help/dispute requests, optionally about one of their requests/bookings),
`GET /api/files/[id]`.

Additional plan features (MVP_PLAN sections 3, 6, 8): customers can cancel an open/quoted
request (submitted quotes become declined, mechanics notified) and a pending reservation;
admins can invite a mechanic by email (captured in the dev mailbox, audited), see insurance
expiring within 30 days, list reviews, work the help desk (`/admin/support`), re-run matching
for a request, and intervene on **demo-fixture** bookings only (cancel or mark disputed with a
reason, hold/release a demo payout). Refunds and real payouts stay blocked (Stripe not connected).
Wrong-role access redirects to `/access-denied`, a clear "not available for your account"
page (record pages a viewer may not see answer 404); signed-out access to protected pages
redirects to `/login?next=...` with a real HTTP 307 (section 9, route protection). `/mechanic`
and `/mechanic/bookings` redirect to the job board (its Bookings tab), `/requests` to `/quotes`.

**Header navigation.** The logo leads to the landing page. Signed out: Find a Mechanic
(`/request`), For mechanics (`/signup?role=mechanic`), Help, Log in, Sign up. Customers:
Request repair, Quotes, Bookings, Account, Support. Mechanics: Job board (also current on
booking pages), Profile (also current on `/mechanic/apply`), Support. Admins: Dashboard,
with every admin section (help desk included) in the admin sub-navigation. Every signed-in
role also gets the notifications bell (unread count), Help and Log out; below the `lg`
breakpoint all of these sit in the Menu panel. The footer links Help, the demo guide and the
demo terms and privacy notice.

**What a suspended mechanic sees.** Matching excludes them (`suspended`). The job board shows
the status with the admin's reason and a Help & support link; new and interested job cards
are hidden, and a job page answers with the same eligibility message instead of the request
details (shared request photos are refused as well). Their own quotes and bookings stay
listed with coarse labels; customers can no longer reserve their submitted quotes
(`MECHANIC_NOT_ELIGIBLE_MESSAGE`). On demo bookings they cannot start work or propose change
orders but can still complete a job already in progress and issue its invoice; the booked
customer's contact details stay visible on confirmed bookings as for any booked mechanic.
Their profile (with the suspension reason) and Help & support remain available. Applied /
under-review, rejected and expired-insurance mechanics get the same job-board gate with their
own message (rejected mechanics can update and resubmit from the profile).

## 11. UI principles

Trustworthy automotive-service look: neutral slate surfaces, one restrained accent,
semantic status colors, generous spacing, clear hierarchy. Mobile first; every page works at
360 px. Native form controls with visible labels, help text, inline errors
(`aria-invalid`, `aria-describedby`) and an error summary on failed submit; visible focus
rings; WCAG AA contrast; keyboard reachable dialogs (native `<dialog>`). Every data view has
loading (`loading.tsx` / pending button state), empty and error states.

**Presentation mode (owner's decision, 3 Oct 2026).** The app is shown to users, so the UI has
no "DEMO"/"demo" banners, badges, watermarks or copy. Seeded records keep `is_demo_fixture = 1`
internally and every integrity rule still applies. Honesty rules are unchanged: nothing is ever
shown as paid online (payment surfaces say "Online payments are coming soon" and checkout stays
disabled); ratings use genuine (non-fixture) reviews only, otherwise "New", and seeded reviews
are never shown to other users as genuine; identity/insurance document images stay marked
"SAMPLE". The look is modern and animated (motion with reduced-motion support) and maps use
approximate locations only.

## 12. Configuration

`src/server/config.ts` exports constants and reads env once: `DATABASE_PATH`
(default `.data/app.db`), `UPLOAD_DIR` (default `.data/uploads`), `DEMO_MODE`
(default `true`), `PLATFORM_FEE_BPS = 1000`, `MAX_MECHANICS_NOTIFIED = 5`,
`REQUEST_TTL_DAYS = 7`, `QUOTE_TTL_HOURS_OPTIONS = [24, 48, 72, 168]`,
`SESSION_TTL_DAYS = 7`, upload limits from section 9, `APP_NAME = "WrenchMatch"`.
No secrets are needed for this local build; `.env.example` documents the variables and the
future Stripe/Supabase keys (server-only, never `NEXT_PUBLIC_`).

The hosted pilot on Vercel adds `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (the database runs
on Turso's libSQL instead of the local file), `BLOB_READ_WRITE_TOKEN` (uploads go to a private
Vercel Blob store), the optional `HOSTED_UPLOAD_MAX_BYTES` (per-submission upload budget under
Vercel's 4.5 MB request limit) and `NEXT_DIST_DIR` (a separate build folder for trial builds).
Without them the app runs exactly as described above. See `docs/DEPLOY.md`.

## 13. Tests

* `tests/unit` (Vitest, node): pricing, matching rules, geo, time-zone helpers, validation
  schemas, upload validation and metadata stripping, password hashing, rate limiter.
* `tests/integration` (Vitest + fresh temp SQLite per file via `tests/support/db.ts`):
  matching end to end; role/ownership/privacy for every query and command and for
  `canViewFile`; quote selection race (double click, competing quotes, separate
  connections), state transitions and the payment guard; slot conflicts; server price
  calculation and immutable snapshots; admin-only commands.
* `tests/e2e` (Playwright, installed Chrome): customer submission, mechanic quote, admin
  approval, quote selection → pending payment, privacy boundaries (URL/id guessing),
  seeded post-booking screens; console errors fail the test.

Vitest aliases `@` → `src` and `server-only` → an empty module.

## 14. Commands

```
npm run db:reset    # delete the database and stored uploads, apply migrations, seed demo data
npm run db:migrate  # apply pending migrations
npm run db:types    # regenerate src/server/db/schema.generated.ts
npm run dev         # http://localhost:3000
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e    # needs the app running (or uses playwright webServer config)
```
