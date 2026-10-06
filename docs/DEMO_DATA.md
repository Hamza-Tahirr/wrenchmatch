# Sample data

`npm run db:reset` deletes the local database and uploads, applies the migrations and runs the
sample-data seed (`scripts/seed.ts`). Everything it creates is **fictional**. The app is shown
in presentation mode (CONTRIBUTING.md, ARCHITECTURE section 11): nothing people read says "demo".
The records are still flagged internally, so every integrity rule applies:

* sample logins have `users.is_demo_account = 1`; the main cast is listed on the login page
  (one-click buttons), the supporting cast logs in with the same password;
* every repair request and quote, and every post-booking record (confirmed, in-progress or
  completed bookings, change orders, invoices, reviews) has `is_demo_fixture = 1`;
* identity and insurance document images are marked **SAMPLE** (header, footnote and a
  subtle diagonal watermark) and say no authority or insurer issued them; insurers are
  "(sample)", policy and ID numbers start with `SMPL-`, certifications are "(self-reported)".

Nothing was ever paid online: payments are not connected (see `docs/PAYMENTS.md`). Seeded
bookings past "pending payment" carry `payment_state = demo_fixture_no_real_payment`, and the
audit log records each one as loaded from sample data without any online payment.

## Dates are relative to the moment you seed

The seed uses the real clock when it runs, in the pilot region's time zone
(America/Phoenix). "Tomorrow", "yesterday", preferred dates and quote expiries are computed
from that moment, so the data stays fresh for a couple of days. Requests stay open for 7
days and the live quotes expire about 48-72 hours after seeding. **Re-run `npm run db:reset`
to refresh the dates** (it also works while `npm run dev` is running).

Preferred dates of open requests are always weekdays, a few days ahead. Notifications older
than 48 hours are marked as read, as if their recipients had seen them; newer ones are
unread.

## Accounts

Every account uses the password **`repair-pilot-2026`** (`DEMO_PASSWORD`), and every email
is an `@example.com` address that receives nothing.

### Main cast (one-click logins on `/login`)

| Email | Name | Role | State | Try |
| --- | --- | --- | --- | --- |
| `admin@example.com` | Avery (Admin) | admin | | dashboard, applications, matching failures, help desk, audit log, dev mailbox |
| `customer@example.com` | Dana | customer | primary customer | compare quotes, a pending reservation, bookings, invoice, review, change order, profile picture |
| `customer2@example.com` | Luis | customer | second customer | privacy checks: his requests are invisible to Dana and to unmatched mechanics |
| `mechanic@example.com` | Marco R. | mechanic | approved; mobile and garage; brake-approved | job board, quoting, bookings, change orders, invoices, payout status, work gallery |
| `mechanic2@example.com` | Priya S. | mechanic | approved; mobile only; brake-approved | insurance expires in 24 days (admin warning); an interested job |
| `garage@example.com` | Sam's Garage | mechanic | approved; garage only; approved for brakes **and** suspension | a truck in progress, a reviewed job; rating still "New" |
| `jordan@example.com` | Jordan T. | mechanic | approved; offers brake work but **not** safety-approved for it | never receives brake requests |
| `applicant@example.com` | Alex K. | mechanic | application waiting for review (`applied`) | three pending documents, one a PDF |
| `suspended@example.com` | Taylor M. | mechanic | suspended (with a reason) | excluded from matching |
| `expired@example.com` | Morgan L. | mechanic | approved, but insurance expired last month | excluded from matching (`insurance_expired`) |
| `rejected@example.com` | Casey D. | mechanic | rejected (with a reason; both documents rejected) | can update and resubmit |

### Supporting cast (same password, not on the one-click list)

| Email | Name | Role | Notes |
| --- | --- | --- | --- |
| `nina@example.com` | Nina P. | customer | Scottsdale; headlight quotes (j), a cancelled request (r) |
| `omar@example.com` | Omar H. | customer | Gilbert/Mesa; wiper quote (k), truck in the shop (o), open help request |
| `grace@example.com` | Grace W. | customer | Phoenix (Arcadia); filters request (l), completed and reviewed service (p) |
| `ben@example.com` | Ben C. | customer | Peoria; diagnosis quotes (m), an expired request (q); no profile picture |
| `hannah@example.com` | Hannah L. | customer | Chandler; completed battery job (n), answered help request; no profile picture |
| `rosa@example.com` | Rosa M. | mechanic | approved; mobile, Peoria |
| `valleyauto@example.com` | Valley Auto Care | mechanic | approved; garage, Chandler; brake-approved |
| `kenji@example.com` | Kenji W. | mechanic | approved; mobile battery/electrical, north Scottsdale |
| `elena@example.com` | Elena V. | mechanic | approved; mobile and garage, Gilbert; brake- and suspension-approved |
| `andre@example.com` | Andre B. | mechanic | approved; mobile, Ahwatukee; domestic makes only; empty work gallery |
| `westside@example.com` | Westside Garage & Tire | mechanic | approved; garage, Glendale; brake-approved, suspension **not** approved |

## Pilot region

From `db/seed-data/pilot-region.json` (see `db/seed-data/README.md`): 35 enabled pilot ZIPs
labelled "Phoenix metro" in Phoenix, Tempe, Scottsdale, Mesa, Chandler, Gilbert, Glendale
and Peoria, plus **Maricopa 85138**, a pilot ZIP more than 20 miles from every mechanic.
**Flagstaff 86001** has a centroid but is not a pilot ZIP, so a request there gets the
"not in the pilot area" message. Centroids are the US Census 2020 ZCTA Gazetteer internal
points, copied unchanged; distances between them are approximate. Maps show only these
approximate points (request ZIP centroids and mechanic base-ZIP centroids), never an address.
Phoenix is only seed data: the app reads `pilot_zips` and assumes no region.

## Mechanics

All 14 applied through the app's own `submitApplication` (profile, private details, services,
makes, weekly availability, a neon monogram profile photo, a SAMPLE photo ID and insurance
certificate) and were reviewed with the admin commands, so their notifications, dev-mailbox
emails and audit events are genuine. Phones are fictional 555-01xx numbers; contact emails
are `@example.com`; garage addresses (only for garage modes) are on fictional streets.

| Mechanic | Base (approximate) | Mode, radius | Services | Makes | Weekly hours (local) |
| --- | --- | --- | --- | --- | --- |
| Marco R. | Tempe 85282 | both, 15 mi | 11 incl. brake work (approved) | all | Mon-Fri 7:30-18, Sat 8-14, Sun 10-14 |
| Priya S. | Phoenix 85016 | mobile, 20 mi | 8 incl. brake work (approved) | Japanese and Korean | Mon-Fri 8-12 and 13-17, Sat 9-13 |
| Sam's Garage | Mesa 85201 | garage | 8 incl. brakes and suspension (both approved) | all | Mon-Fri 7-17:30, Sat 8-12 |
| Jordan T. | Phoenix 85012 | mobile, 20 mi | 9 incl. brake work (**not** approved) | 11 makes | Mon-Fri 15-20, Sat 8-16, Sun 10-16 |
| Rosa M. | Peoria 85382 | mobile, 15 mi | 9 maintenance, battery and diagnostic services | all | Mon-Sat 7-15 |
| Valley Auto Care | Chandler 85224 | garage | 8 incl. brake work (approved) | all | Mon-Fri 7:30-18, Sat 8-13 |
| Kenji W. | Scottsdale 85260 | mobile, 16 mi | 6 battery, electrical and lighting services | all | Mon-Fri 9-19, Sun 10-15 |
| Elena V. | Gilbert 85296 | both, 20 mi | 8 incl. brakes and suspension (both approved) | all | Mon-Fri 8-17, Sat 9-14 |
| Andre B. | Phoenix 85044 | mobile, 12 mi | 7 maintenance services | 10 domestic makes | Mon-Fri 6:30-11:30, Sat 7-12 |
| Westside Garage & Tire | Glendale 85304 | garage | 8 incl. brakes (approved) and suspension (**not** approved) | all | Mon-Sat 8-18 |
| Morgan L. | Tempe 85283 | mobile, 15 mi | 6 | all | Mon-Fri 8-17 |
| Taylor M. | Scottsdale 85257 | mobile, 20 mi | 7 | 6 makes | Mon-Sat 8-18 |
| Casey D. | Glendale 85302 | mobile, 15 mi | 5 | 3 makes | Sat-Sun 8-17 |
| Alex K. | Phoenix 85020 | mobile, 20 mi | 5 incl. suspension (awaiting safety review) | all | Mon-Fri 16-20, Sat 8-17 |

Together they offer all 12 service categories, from 14 different base ZIPs across the metro.
Admin history: documents verified and mechanics approved months ago (Marco, Priya, Sam's
Garage, Valley Auto Care, Elena and Westside also safety-approved for what the table says),
Jordan and Westside approved with a note about the unapproved category, Taylor suspended nine
days before seeding, Casey's documents and application rejected about four weeks before. Alex
applied nine days before seeding, before any sample request that ran matching.

## Scenarios

Letters a-i match the build brief; j-r are the supporting cast. Amounts are what pricing.ts
computed from the line items; the platform fee (10% of labor, provisional) is included in
each total.

### Dana (`customer@example.com`, Tempe 85281 unless noted)

**(a) Compare quotes: brake squeal on a 2017 Honda Civic LX.** Brake work, mobile or
garage, submitted about a day before seeding. Matching notified the five closest
brake-approved mechanics in range (Marco, Sam's Garage, Valley Auto Care, Priya, Elena);
Jordan, who lists brake work, was left out with `safety_category_not_approved`. Quotes with
itemized labor, parts, tax and fee lines:

| Mechanic | Mode | Total | State |
| --- | --- | --- | --- |
| Marco R. | mobile | $368.18 (pads, rotors, hardware) | submitted, expires about 45 h after seeding |
| Sam's Garage | garage | $225.71 (pads, resurfacing, shop supplies) | submitted, expires about 47 h after seeding |
| Priya S. | mobile | $322.93 | **expired** (24-hour quote) |

**(b) Waiting for quotes: no-start 2015 Toyota Camry SE, ZIP 85282**, mobile, not
drivable, submitted two hours before seeding for the next weekday morning. Matched Marco,
Priya and Kenji; no quotes yet, so **Marco has a new job to quote** on his job board. Its
matching diagnostics show the exclusions clearly: Morgan only `insurance_expired`, Taylor
only `suspended`, Jordan only `no_availability` (evenings only on weekdays), Sam's Garage
`category_not_offered` and `mode_mismatch` (garage only).

**(c) Reservation pending payment: battery for the 2019 Subaru Outback.** Marco quoted
$287.81 and Jordan $238.76; Dana reserved Marco's quote with the app's own `selectQuote`
(consent snapshot, money from pricing.ts, Marco's quote selected, Jordan's declined, request
reserved). The booking is a real `pending_payment` reservation (`is_demo_fixture = 0`):
"Online payments are coming soon", checkout disabled.

**(d) Confirmed booking tomorrow: check-engine light on a 2012 Ford Escape SE.** Marco,
mobile, tomorrow 10:00-11:30, $165.25. Marco proposed a change order the evening before
seeding (replace all four spark plugs, $107.56) that **awaits Dana's approval**.

**(e) Completed yesterday, invoice issued: oil change on the 2019 Subaru Outback.** Marco,
mobile, $100.69 quoted. During the job he proposed new wiper blades ($45.65), Dana approved,
he completed the job and issued the invoice (`INV-...`, $146.34, platform fee $5.00). Payout
**pending** (nothing is paid out while payments are not connected). Dana added a "before"
photo of the old wipers and Marco two "after" photos. **No review yet**: Dana can leave one.

**(f) Completed last week, reviewed: suspension clunk on the 2019 Subaru Outback.** Sam's
Garage, garage, $226.24, invoiced, with before/after photos of the end links. Dana left a
5-star review, which is seeded and **never counts toward ratings**: Sam's Garage still shows
"New".

**(i) Help desk.** An open help request from Dana (topic "Problem with a booking") about the
confirmed booking (d), raised 45 minutes before seeding; the admins were notified.

### Luis (`customer2@example.com`)

**(g) Matched, private: check-engine light on a 2014 Nissan Altima, Glendale 85301**,
mobile, any time. Matched Jordan, Priya and Rosa. Marco (17 mi, outside his 15 mi radius) and
Sam's Garage were not matched, so logging in as Marco, or as Dana, the request is "not found".

**(h) Honest zero match: dead battery in a work truck at a job site in Maricopa 85138.**
Matching evaluated all 14 mechanics and found none in range (the closest mobile mechanic is
23 mi away, and the garages are garage-only), so `matched_count` is 0, Luis was told no
mechanic is available yet and the admin got a "no mechanics matched" alert. It is the request
on the admin's matching-failures page.

### Supporting cast

**(j) Nina, Scottsdale 85251: driver-side low beam out on a 2018 Mazda CX-5** (photo of the
cracked, blackened bulb), evening visit. Matched Marco and Kenji (Elena `no_availability`,
Jordan `make_not_supported`, Andre both). Quotes: Kenji $70.66 (both bulbs, 72 h), Marco $60.53.

**(k) Omar, Gilbert 85234: streaking wipers on a 2020 Toyota RAV4.** Matched Elena and
Marco. Elena quoted $80.50 (front and rear blades); Marco **passed** on the job.

**(l) Grace, Phoenix 85018: musty A/C, filters on a 2016 Lexus RX 350.** Matched Priya, Marco
and Elena; no quotes yet; Priya marked it **interested**.

**(m) Ben, Peoria 85345: misfire on a 2013 Chevrolet Silverado.** Matched Westside Garage &
Tire and Rosa, who both quoted a diagnosis without parts: Westside $125.00 (garage), Rosa
$95.00 (mobile, early start).

**(n) Hannah, Chandler 85225: corroded battery on a 2017 Hyundai Elantra, completed last
week.** Priya, mobile, $275.10, invoiced. Priya proposed a cabin air filter ($37.01) that
Hannah **declined**, so the invoice has no change orders. Before/after photos (corroded
terminals, new battery). Hannah asked the help desk whether she owes anything through the
app; the admin answered that nothing is charged online (online payments are coming soon).

**(o) Omar, Mesa 85203: brake grinding on a 2015 Ford F-150, in progress.** Sam's Garage,
garage, $422.22; started on the last weekday afternoon. Sam found a seized caliper and
proposed replacing it ($218.10), which Omar **approved**; the job is still in progress
(waiting for the part), with two "before" photos. Omar has an open help request about it.

**(p) Grace, Phoenix 85018: maintenance on the Lexus two weeks ago.** Elena, mobile, $123.08,
invoiced, two "after" photos, and a seeded 4-star review (never counted: Elena shows "New").

**(q) Ben's oil change, expired.** Submitted eight days before seeding, matched Westside and
Rosa; Westside quoted $110.34; nobody was chosen, so the quote and then the request expired.

**(r) Nina's wipers, cancelled.** Matched Marco and Elena, then Nina cancelled the next
morning ("swapped them myself"); both mechanics were notified.

### Matching at a glance

| Request | Notified (`matched_count`) |
| --- | --- |
| (a) brakes, Tempe 85281 | Marco, Sam's Garage, Valley Auto Care, Priya, Elena (5) |
| (b) no-start, Tempe 85282 | Marco, Priya, Kenji (3) |
| (c) battery, Tempe 85281 | Marco, Priya, Jordan, Kenji (4) |
| (g) code read, Glendale 85301 | Jordan, Priya, Rosa (3) |
| (h) battery, Maricopa 85138 | nobody (0) |
| (j) bulbs, Scottsdale 85251 | Marco, Kenji (2) |
| (k) wipers, Gilbert 85234 | Elena, Marco (2) |
| (l) filters, Phoenix 85018 | Priya, Marco, Elena (3) |
| (m) diagnosis, Peoria 85345 | Westside Garage & Tire, Rosa (2) |
| (q) oil change, Peoria 85345 (expired) | Westside Garage & Tire, Rosa (2) |
| (r) wipers, Scottsdale 85251 (cancelled) | Marco, Elena (2) |
| (d), (e), (f), (n), (o), (p) bookings | the booked mechanic (1) |

Requests (a)-(c), (g), (h), (j)-(m), (q) and (r) went through the app's
`submitRepairRequest`, so their `match_evaluations` and `job_matches` come from the real
matching run. Morgan, Taylor, Casey and Alex are never matched; their evaluations record why.

### States at a glance

* Requests (17): 4 open, 4 quoted, 1 reserved, 6 booked, 1 expired, 1 cancelled.
* Bookings (7): 1 pending payment (c), 1 confirmed (d), 1 in progress (o), 4 completed
  (e, f, n, p); 4 invoices; 2 seeded reviews (never counted).
* Change orders (4): 1 awaiting the customer (d), 2 approved (e, o), 1 declined (n).
* Help desk (4): 2 open (Dana, Omar), 2 answered (Kenji about payouts, Hannah about her
  invoice). The admin also invited a mechanic by email: captured in the local dev mailbox,
  never sent.

## What is a seeded fixture

| Record | Fixture? | Why |
| --- | --- | --- |
| All 17 repair requests and 17 quotes | yes | seeded sample data |
| Bookings (d), (e), (f), (n), (o), (p), their change orders, 4 invoices, 2 reviews | yes | only fixtures can be confirmed, started or completed while payments are not connected |
| Booking (c) | no | a real `pending_payment` reservation made by `selectQuote` |

Booked fixtures are inserted in their final state (request `booked`, quote `selected`,
booking `confirmed`, payment state `demo_fixture_no_real_payment`), each with one matching
record for the booked mechanic computed by the real matching rules, and an audit event
(shown to admins as "Booking loaded from sample data (no online payment)"). Every later step
(start, change orders, completion, invoice, review) ran through the app's own commands.

## Pictures

Every picture is original artwork drawn by the seed (`scripts/seed/art/*`: SVG rendered with
sharp, with a fine film grain), then passed through the app's `prepareUpload`, so each is a
re-encoded JPEG with all metadata removed (`metadata_stripped = 1`). No photo carries a
watermark or caption bar; nothing is downloaded and no real person is pictured.

* **Scenes** (`scripts/seed/art/catalog.ts`, 1200 x 900): a front wheel with brake dust and a
  scored rotor (or clean), the rotor and caliper close up (worn or new), the strut, spring
  and sway-bar link (worn or new), the instrument cluster at dusk (check-engine, no-start,
  oil life, all clear), a scan tool showing live misfire data, the battery in the engine bay
  (crusted terminals, original, or a fresh AGM with a terminal boot), the coil packs on an
  inline-four (one cracked, or new), the engine air filter (dirty in the airbox, or old next
  to new), a reflector headlight (cracked, blackened bulb, or lit), rain on the windshield at
  night (a torn wiper smearing it, or a new one sweeping it clean), a sedan on a Phoenix
  driveway at dusk (hazards on, or ready to go) and a pickup at a job site.
* **Profile pictures**: neon gradient monograms; mechanics' have a wrench badge
  (`mechanic_profile_photo`); Dana, Luis, Nina, Omar, Grace and the admin have one as their
  account picture (`user_avatar`, migration 0003); Ben and Hannah show initials.
* **Work galleries** (`mechanic_gallery`): 30 captioned photos for Marco, Sam's Garage,
  Priya, Elena, Valley Auto Care, Kenji, Rosa and Westside; Andre's gallery is empty.
* **Booking photos** (`booking_photos`): 11 before/after photos on bookings (e), (f), (n),
  (o) and (p), each added by that booking's customer or mechanic.
* **Documents**: 28 SAMPLE images (photo ID and insurance certificate per mechanic; Casey's
  ID is deliberately out of focus) and one tiny PDF (Alex's training record, also "SAMPLE").

108 private files in all, under `UPLOAD_DIR`, served only by `GET /api/files/[id]` after the
access check.

## Notifications, dev mailbox and audit log

They come from the commands above, as they would in the app: job matches, quotes received,
the reservation, change orders (proposed, approved, declined), job starts and completions,
invoices, reviews, photos added to bookings, applications and admin decisions, the no-match
alert, the cancellation and the help-desk requests and answers. The dev mailbox holds the
captured emails (nothing was sent). The audit log shows every admin decision with its reason,
plus the customer and mechanic actions.

## How the seed works

* `scripts/seed.ts` exports `seed(options?)` (database, upload storage, clock and logger
  can be injected; `npm run db:reset` uses the defaults). It refuses to run when
  `NODE_ENV=production` before touching any database, and refuses a database that is
  missing migrations or already has data.
* `scripts/seed/*` holds the steps: pilot region, accounts, mechanics
  (`mechanic-plans.ts` has their details), booked scenarios, open scenarios, the help desk,
  the pictures (`scenarios/media.ts`), and a final step that expires stale quotes and
  requests as of now, marks old notifications read and checks the key invariants, including
  that no seeded text says "demo".
* The photo scenes are drawn once per process (in the background while accounts and
  mechanics are created) and reused; a full seed takes about a minute on a busy laptop.
* Domain commands are used wherever one exists; rows are inserted directly only for what no
  command can create (sample accounts, reference data, confirmed bookings), following the same
  rules and triggers.
* `tests/integration/seed.test.ts` seeds a temp database and checks the accounts, every
  scenario, the pictures and the invariants (only fixtures past `pending_payment`,
  `matched_count` equal to the job matches, sanitized images, totals equal to pricing.ts,
  excluded mechanics never matched, no "demo" wording, honest credentials), and seeds again
  late on a Saturday to check the relative dates.
