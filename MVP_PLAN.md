# Car Repair Marketplace — MVP Plan

**Status:** planning document only; no application has been built.  
**Prepared:** 30 September 2026  
**Source brief:** the original product brief for this project.

## 1. Goal and working assumptions

Build the smallest usable marketplace in which a car owner submits a real repair problem, nearby approved mechanics send quotes, the owner chooses and books one, pays through the platform, the mechanic performs the work, and the owner leaves a review.

This plan assumes a **US launch** because the brief uses ZIP codes and Stripe Connect. Start in **one metro area**, then add nearby cities after the first transactions work reliably. The Phoenix area is a *candidate*, not a final legal or business decision. The exact state, cities, taxes, repair rules, insurance requirements, and Stripe account setup must be confirmed before accepting live jobs. In particular, California's rules for paid repair referral services create extra registration and advertising obligations [S13].

**Pilot success means:** at least one real customer can complete the full flow without staff entering data or taking payment outside the platform. Staff may still manually approve mechanics, resolve exceptions, and help with supply.

## 2. What Bubble is, and the stack decision

**Bubble** is a visual, no-code app builder. It provides a page editor, database, workflows (the app's logic), plugins, and hosting. It can be quick for a prototype. Bubble says its apps run on Bubble and cannot be exported as application code, so a Bubble app cannot simply be deployed to Vercel [S1]. Bubble's Free tier is for building; a live web app needs a paid plan (web-only Starter was listed at $29/month billed annually or $32 month-to-month when checked) [S2].

**Decision for this MVP:** build a responsive web app with **Next.js App Router + React + TypeScript** on Vercel; use **Supabase** for Postgres, Auth, private file storage, and row-level security; use **PostGIS** for distance matching; and use **Stripe Connect + hosted Checkout** for payments. Use a stable, supported release of each package and pin it in the lockfile. Node.js 24 is currently supported and the default for new Vercel projects [S3]. Next.js had a security release scheduled for 30 September 2026; before implementation or launch, check the published advisory and use its patched version rather than blindly pinning a version from this document [S4].

Suggested supporting tools: Tailwind CSS and accessible UI components for the interface, Zod for input validation, transactional email through a custom SMTP provider, and an error monitor. These are implementation choices, not additional products the customer must learn.

### Can this run on Vercel for free?

Yes for a **personal, non-commercial prototype or demo**. Vercel's Hobby plan is restricted to non-commercial use. Its policy also counts a deployment made for a paid client or by a paid developer as commercial, even before it takes a payment. Use **Pro** for this business's commercial deployment and for any client/paid development deployment [S5]. Supabase Free is useful for development, but an inactive project may pause and it lacks the production backup allowance of Pro [S6]. Current baseline production subscriptions are approximately **$20/month for one Vercel Pro deploying seat + $25/month for one Supabase Pro project**, plus domain, email, storage/traffic overages, and payment fees; confirm prices at purchase [S5][S6]. This is a planning estimate, not a guaranteed monthly bill.

## 3. MVP boundaries

### Included

- Responsive website for customer, mechanic, and admin. No native mobile app is needed for the pilot.
- Customer account with email verification; vehicle details, repair request, private photo and short-video uploads, quotes, booking, payment, job history, and verified review.
- Mechanic application, manually reviewed profile, Stripe-hosted payout onboarding, job notifications, quote submission, booking details, job completion, and payout status.
- One mechanic per booking. A mechanic can serve in a garage, travel to the customer, or both.
- Search by pilot service area, category, supported make, service mode, travel radius, and active approval status.
- Itemized estimates, customer approval, change orders for extra work, invoices, cancellations/refunds, and an admin audit trail.
- Email and in-app notifications. SMS may be added after consent, sender registration, and costs are checked.

### Not in the first release

- Nationwide coverage, bidding auctions, subscriptions, financing, emergency roadside dispatch, towing, fleet accounts, AI diagnosis, and automated mechanic approval.
- An in-app chat that exposes personal contact details before booking. Job-specific questions can be handled by structured quote notes or admin support.
- A promise of a platform warranty until its terms, funding, and claim handling are agreed.
- Native iOS/Android apps. The web app must still work well on phones.

## 4. Pilot repair categories

Make the following categories selectable, as requested: **diagnostic visit; basic check-engine-light code read; battery replacement; battery/no-start diagnosis; oil change; filters; bulbs; wipers; basic maintenance; minor engine/sensor work; brake work; suspension work**.

The check-engine-light option must say that a code read alone is **not a complete diagnosis**. Each category needs a short definition, required vehicle information, and a note that hidden faults can require a new customer-approved estimate. Enable brake, suspension, and other safety-sensitive work only for mechanics whose experience, insurance, service location, and permitted scope have been reviewed. Admin must be able to disable a category or service area without deploying code.

## 5. The eight core screens

| Screen | Main actions and information |
| --- | --- |
| 1. Landing | One clear primary button: **Find a Mechanic**. Explain the process, pilot coverage, and that a quote is needed before booking. |
| 2. Request repair | ZIP/address; year, make, model, mileage; category and description; photos/video; drivable yes/no; preferred date/time; mobile or garage; phone/email; consent. Verify email before notifying mechanics. |
| 3. Quotes | Request status and real match count; quote cards with mechanic first name/display name, real review count/rating or “New”, scope, labor, parts, taxes/fees, availability, duration, and expiration. No contact details yet. |
| 4. Booking and payment | Itemized estimate and terms, service location and time, approval record, Stripe-hosted Checkout, confirmation after verified payment webhook. Reveal contact details to the booked parties. |
| 5. Customer account | Requests, bookings, invoices, change-order approvals, cancellation/help, and one review per completed booking. |
| 6. Mechanic signup/profile | All onboarding fields; document and insurance upload; coverage radius, service modes, makes, categories, availability; Stripe onboarding status; approval status. |
| 7. Mechanic job board | Matched jobs with coarse location and request details, **Interested / Quote** action, own quotes, confirmed jobs, completion and invoice actions. |
| 8. Admin dashboard | Approvals, document expiry, service areas/categories, matches, requests, quotes, bookings, payments/refunds, disputes, reviews, and audit history. |

Auth, help, upload, change-order, and cancellation interactions may use steps or dialogs within these screens. The count of eight is a navigation target, not a limit on essential states.

## 6. Customer and mechanic journeys

### Customer

1. Click **Find a Mechanic**, enter all fields in the brief, and verify email. A phone number is collected for an active booking and service coordination; consent to any text notifications is recorded separately.
2. Submit the request. Validate the pilot ZIP/address, supported category, media types/sizes, and drivable status. Show the **actual** number of mechanics notified; never claim “sent to 4” when fewer were matched. If none qualify, say so and offer admin follow-up.
3. Review a small number of itemized quotes. Show genuine ratings only from completed platform jobs. Before booking, the mechanic sees no customer phone, email, or exact address; the customer sees no mechanic phone, email, or exact garage address unless disclosure is legally required in that location.
4. Select a quote and available time, accept the estimate and cancellation policy, then pay through Stripe. A booking is confirmed only after Stripe's server-side payment event is verified.
5. See the confirmed contact/service details. Receive updates when the mechanic starts and completes the job. Approve any extra work and extra charge **before** it is done.
6. Receive an itemized invoice, request help if needed, then leave one review after completion.

### Mechanic

1. Apply with **name/business name, phone, email, location, travel radius, mobile/garage/both, makes, services, years of experience, applicable certification, insurance, profile photo, ID/document, and availability**. Staff verifies and manually approves the application. Stripe collects payout identity/bank details in its hosted onboarding; the platform should avoid storing those details itself.
2. Receive eligible jobs by email and in the job board. Each preview shows category, vehicle, description, media allowed for that job, approximate location, preferred time, and service mode. It withholds customer contact and exact address.
3. Press **Interested** and submit a quote with labor price, whether parts are included, itemized parts if known, earliest availability, estimated duration, scope/exclusions, and notes. A mechanic may withdraw an unaccepted quote.
4. A submitted quote commits the mechanic to its offered scope and time until the quote expires; the mechanic terms must state this. When a customer selects and pays for it, the booking is accepted without a second mechanic approval. The mechanic then sees the revealed contact/service details, performs the work, and uploads the final invoice.
5. Request customer approval for any changed scope or price. Mark the job complete. View payout state; the platform releases eligible funds under the written payout policy.

### Admin

Approve or reject mechanics with a reason, check insurance expiry, view match failures, invite additional mechanics, intervene in cancelled/disputed jobs, issue approved refunds, and suspend accounts. Every money or approval action must be logged with who did it, when, and why.

## 7. Rules and state model

| Record | Core states | Important transition rule |
| --- | --- | --- |
| Mechanic | applied → under review → approved / rejected / suspended | Only approved mechanics with completed payout onboarding receive live jobs. Expired required insurance pauses eligibility. |
| Request | draft → open → quoted → booked / expired / cancelled | Customer owns it. It can receive several quotes, but only one quote can become its booking. |
| Quote | submitted → accepted / declined / expired / withdrawn | A quote has a fixed expiration and immutable itemized price snapshot once accepted. |
| Booking | pending payment → confirmed → in progress → completed / cancelled / disputed | Confirmation comes from a verified Stripe event, not a browser redirect. State changes require role and ownership checks. |
| Change order | proposed → approved / rejected → paid / void | No extra work or charge before timestamped customer approval and successful payment. |
| Payout | not eligible → pending → sent / failed / held | Admin can hold a payout during a documented dispute. Stripe is the payment ledger; app state mirrors verified events. |

Store money in integer cents and currency codes. Keep the accepted quote, consent text/version, service time, approval timestamps, invoice, refund reason, and Stripe object IDs as an audit record. Prevent two customers or two mechanics from booking the same exclusive slot if availability is limited. Use database transactions or RPCs for multi-record changes, unique constraints for one booking per request, and idempotency keys for payment actions.

## 8. Matching and notifications

1. Maintain configurable pilot ZIPs and service categories. Geocode entered addresses; if the customer supplies ZIP only, use a ZIP-area centroid for **approximate** matching, then obtain an exact service address before booking.
2. Store a mechanic's garage/base location and travel radius privately. For mobile jobs, match when the request point falls within that mechanic's radius. For garage jobs, show eligible shops within a customer travel distance. Use PostGIS geography points, a GiST index, and distance queries [S9].
3. Filter for approved status, supported category and make, mode, availability, and valid insurance. Record why a mechanic was matched or excluded so admin can diagnose empty results.
4. Notify a bounded number of closest eligible mechanics first (for example five); if no quote arrives within the pilot response target, notify more or ask admin to help. Deduplicate alerts and rate-limit repeated requests.
5. Send email and in-app alerts for request, quote, booking, change order, completion, and cancellation. Use a durable notification outbox with retries. A scheduled worker may run via Supabase Cron or Vercel Pro Cron; Vercel Hobby's cron frequency is too low for timely marketplace alerts [S10].

## 9. Payments, fees, and refunds

**Proposed pilot pricing:** platform fee = **10% of labor** in the accepted quote, within the brief's 5–15% range. Parts, taxes, and any customer-visible fees must be separate line items. The final fee and who pays processing costs need business and tax review before launch.

- Onboard each approved mechanic with **Stripe Connect**, preferably Stripe's current Accounts v2 marketplace flow and Stripe-hosted onboarding, subject to the actual platform account's supported configuration [S11]. Never store full card or bank details in this app.
- The chosen mechanic and final quoted amount are known at checkout. Use a destination-charge design with Stripe-hosted Checkout and a platform application fee. The customer sees the full amount before paying; the platform calculates the amount from its database, never from browser-supplied totals [S11].
- **MVP default:** charge at booking and release the mechanic's payout only after completion according to the mechanic agreement and Stripe's permitted payout schedule. Stripe is not an escrow service. Confirm manual-payout availability, maximum hold periods, and refund/dispute liability with Stripe before launch. If that account configuration is unavailable, revise the payment flow before live payments.
- A change in price or scope requires a new itemized change order, customer approval, and a separate successful payment for the difference. Do not charge a higher amount based on a verbal request alone.
- Before work begins, apply a written cancellation/no-show policy and determine whether a refund is full or partial. After payment, a refund must also account for the connected-account transfer and platform fee. Only trusted server code can perform refunds.
- Verify webhook signatures against the raw body, store each Stripe event ID once, handle duplicate/out-of-order events, and reconcile payment and payout states daily. Keep payments and payouts visible to admin. Do not mark a booking paid based on Checkout's success URL.
- Model disputes and chargebacks: freeze the relevant payout when possible, preserve estimate/approval/invoice evidence, give staff an escalation path, and record the final Stripe outcome.

**Unit economics check.** At a $200 labor + $80 parts job with a 10% labor fee, gross platform revenue is $20. At the published US standard card rate of 2.9% + 30¢, processing on $280 is about $8.42. Stripe Connect's platform-priced model lists $2 per monthly active account and 0.25% + 25¢ per payout [S12]. A single payout near $260 adds about $0.90, leaving about **$10.68 before the account fee, refunds, support, email, and hosting**. A small $85 job with $50 labor yields only $5 fee and very little margin. Test a minimum fee or disclosed booking fee before scale rather than assuming 5–15% always covers costs. Rates and the actual Stripe contract must be rechecked before launch.

## 10. Data and security design

Use SQL migrations as the source of truth. The suggested entities are:

- `profiles` and `user_roles` (customer, mechanic, admin); `vehicles`.
- `mechanic_profiles`, `mechanic_private`, `mechanic_services`, `mechanic_makes`, `mechanic_availability`, and `mechanic_verifications` (including insurance expiry and document status).
- `repair_requests`, `request_private` (contact and precise location), `request_media`, and `job_matches`.
- `quotes` and `quote_items`; `bookings`, `booking_consents`, `change_orders`, `invoices`, and `reviews`.
- `payments`, `refunds`, `payouts`, `stripe_webhook_events`, `notification_outbox`, and `audit_events`.

Separate public/display fields from phone, email, exact address, identity documents, and insurance files. Apply Postgres row-level security and explicit database grants to every exposed table. The owner and authorized admin see private data; booked counterparties see only the contact and service details needed after confirmation. A rejected, expired, or merely quoted match never receives those details. Admin access uses MFA and limited roles. Supabase's own guidance makes grants and row-level policies two separate checks [S7].

Keep all uploads in **private buckets** with file type/size limits, malware checks where practical, short-lived access URLs, and strict Storage policies [S8]. Strip photo GPS/EXIF metadata and video location metadata before sharing with mechanics; quarantine originals until processed. Limit short video size/duration and reject files that cannot be processed safely. Avoid putting personal data in notification links or logs.

Use server-side authorization for every write, including quote, approval, cancellation, refund, and admin actions. Validate inputs again on the server. Keep payment secrets and Supabase elevated keys server-side only. Rate-limit login, request submission, quoting, and upload endpoints. Provide account/data deletion and retention procedures consistent with the launch location's requirements.

## 11. Operational and legal launch decisions

The following are **launch gates**, not assumptions that the code can solve:

1. Choose the pilot state/cities and have local counsel confirm whether the platform and mechanics need automotive-repair, business, mobile-service, or advertising registrations. California is especially material because its rules cover a referral service that collects payment for another repairer [S13].
2. Have counsel review mechanic independent-contractor terms, quote/authorization and invoice wording, cancellation/refund policy, warranty claims, review moderation, privacy policy, and SMS consent. Mechanics should set their own quotes and availability under the intended marketplace model.
3. Verify mechanic identity, relevant experience/certification, insurance coverage and expiration, service address, and any local licenses. Stripe's KYC is for payments; it does not replace trade/insurance review.
4. Have a CPA confirm labor/parts sales-tax treatment, fee taxation, merchant-of-record treatment, and information reporting. The app must support tax and fee line items, not hard-code one state's rules.
5. Configure a real email sender before live signup: Supabase's default SMTP is restricted to project team addresses and is not intended for production [S14]. If SMS is added, obtain proper consent and sender registration first.
6. Publish support contacts, incident and dispute procedures, backups, and a restore drill. Define who answers urgent same-day service issues when no mechanic responds.

## 12. Build sequence and acceptance checks

| Stage | Work | Exit check |
| --- | --- | --- |
| 0. Decisions | Pick pilot area; confirm legal/payment model, fees, categories, cancellation and payout policy; recruit initial mechanics. | Written decisions and launch owner for each gate in section 11. |
| 1. Foundation | Create Next.js app, Vercel environments, Supabase project and SQL migrations, auth, roles, private storage, seed data, and audit log. | Customer, mechanic, admin accounts have only their allowed data; private fields/media cannot be fetched before booking. |
| 2. Marketplace | Build request form, matching, mechanic onboarding/approval, alerts, quoting, quote comparison, and booking states. | A real pilot request reaches eligible approved mechanics; mechanic can quote; customer can choose one; empty-match case is honest. |
| 3. Money | Integrate Stripe Connect onboarding, Checkout, webhooks, fee calculation, refunds, change orders, invoices, payout workflow. | Sandbox end-to-end payment and refund reconcile with app records, including duplicate and delayed webhooks. |
| 4. Pilot readiness | Accessibility and phone-browser pass, security/RLS checks, observability, backup restore, staff playbook, policies, and live smoke test. | One supervised real job is requested, quoted, booked, paid, completed, invoiced, paid out, and reviewed. |

Important test cases: two mechanics quote the same job; only one booking succeeds; quote expires during checkout; payment fails; webhook repeats or arrives late; customer cancels; mechanic cancels; price increases after inspection; refund and dispute occur; insurance expires; ZIP has no mechanic; a user tries to read another user's private request/media; a visitor attempts an admin action. Test both mobile and garage service, and the phone-sized UI.

Track pilot metrics: request-to-first-quote time, percent of requests with at least one quote, quote-to-booking conversion, completed jobs, cancellations/refunds, payout delays, support minutes per job, and contribution margin by category. Expand beyond the first metro only when supply, service quality, and economics are stable.

**Rough implementation estimate:** 6–10 weeks for one experienced full-stack developer with timely product/legal decisions and initial mechanic supply. This is a planning range; complex compliance, video processing, payout rules, or sparse mechanic supply can extend it.

## Sources checked for this plan

- [S1] [Bubble: application and data ownership](https://manual.bubble.io/account-and-marketplace/application-and-data-ownership)
- [S2] [Bubble: pricing and plans](https://manual.bubble.io/account-and-marketplace/account-and-billing/pricing-plans)
- [S3] [Vercel: supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [S4] [Next.js: September 2026 security release notice](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026)
- [S5] [Vercel: fair use and commercial deployment rules](https://vercel.com/docs/limits/fair-use-guidelines), [Hobby plan](https://vercel.com/docs/plans/hobby), and [Pro pricing](https://vercel.com/pricing)
- [S6] [Supabase: pricing](https://supabase.com/pricing) and [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [S7] [Supabase: row-level security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [S8] [Supabase: private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [S9] [Supabase: PostGIS geo queries](https://supabase.com/docs/guides/database/extensions/postgis)
- [S10] [Vercel: Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [S11] [Stripe: Connect marketplace quickstart](https://docs.stripe.com/connect/marketplace/quickstart) and [destination charges](https://docs.stripe.com/connect/destination-charges.md?platform=web&ui=stripe-hosted)
- [S12] [Stripe: card pricing](https://stripe.com/pricing) and [Connect pricing](https://stripe.com/connect/pricing)
- [S13] [California BAR: mobile and referral repair dealer regulations](https://www.bar.ca.gov/regulatory-actions) and [approved text](https://www.bar.ca.gov/pdf/regulatory-actions/mobile-referral-ARD-2025/approved-text.pdf)
- [S14] [Supabase: custom SMTP for production](https://supabase.com/docs/guides/auth/auth-smtp)
