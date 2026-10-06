// Pictures people added themselves (docs/MEDIA.md, migration 0003): profile pictures for some
// customers and the admin, work galleries for most approved mechanics, and before/after photos
// on the sample bookings. All go through the media commands (setMyAvatar, addGalleryPhotos,
// addBookingPhotos), so file rows, sanitizing, notifications and audit events are genuine.
import { setMyAvatar } from "@/server/media/avatar";
import { addBookingPhotos } from "@/server/media/booking-photos";
import { addGalleryPhotos } from "@/server/media/gallery";

import type { SceneKey } from "../art/catalog";
import { EMAIL, type SampleEmail } from "../accounts";
import { monogramPicture, samplePhoto, type MonogramSpec } from "../images";
import type { SeedClock } from "../clock";
import type { SeedAccounts, SeedRun } from "../types";
import type { BookedScenarios } from "./booked";

const AVATARS: ReadonlyArray<{ email: SampleEmail; spec: MonogramSpec; daysAgo: number }> = [
  { email: EMAIL.dana, spec: { initials: "D", palette: "violet" }, daysAgo: 60 },
  { email: EMAIL.luis, spec: { initials: "L", palette: "emerald" }, daysAgo: 12 },
  { email: EMAIL.nina, spec: { initials: "NP", palette: "rose" }, daysAgo: 30 },
  { email: EMAIL.omar, spec: { initials: "OH", palette: "sky" }, daysAgo: 20 },
  { email: EMAIL.grace, spec: { initials: "GW", palette: "amber" }, daysAgo: 70 },
  { email: EMAIL.admin, spec: { initials: "A", palette: "cyan" }, daysAgo: 200 },
];

type GalleryPhoto = { scene: SceneKey; caption: string };

/** Work galleries, oldest photo first (the gallery shows them in this order). */
const GALLERIES: ReadonlyArray<{ email: SampleEmail; daysAgo: number; photos: readonly GalleryPhoto[] }> = [
  {
    email: EMAIL.marco,
    daysAgo: 150,
    photos: [
      { scene: "brake-new", caption: "Front pads and rotors on a 2018 Accord, ready to bed in" },
      { scene: "wheel-new", caption: "Finished brake job: fresh rotor behind the spokes" },
      { scene: "battery-new", caption: "AGM battery swap with felt washers and a terminal boot" },
      { scene: "coils-new", caption: "Coil-on-plug replacement on all four cylinders" },
      { scene: "headlight-on", caption: "Low-beam bulb replaced and aimed against the garage wall" },
      { scene: "scan-tool", caption: "Live misfire data before replacing any parts" },
    ],
  },
  {
    email: EMAIL.sam,
    daysAgo: 240,
    photos: [
      { scene: "suspension-new", caption: "New sway bar end links, torqued to spec" },
      { scene: "brake-new", caption: "Ceramic pads with a freshly machined rotor" },
      { scene: "filter-compare", caption: "Old vs. new engine air filter from a weekly service" },
      { scene: "wheel-silver", caption: "Wheel back on after a brake inspection" },
      { scene: "dash-all-clear", caption: "All warning lights out after the repair" },
    ],
  },
  {
    email: EMAIL.priya,
    daysAgo: 90,
    photos: [
      { scene: "battery-new", caption: "Battery replacement on a Subaru Outback" },
      { scene: "filter-compare", caption: "Engine air filter after 30,000 miles of desert dust" },
      { scene: "dash-all-clear", caption: "Oil-life reset after a full synthetic change" },
    ],
  },
  {
    email: EMAIL.elena,
    daysAgo: 100,
    photos: [
      { scene: "brake-new", caption: "Pads and rotors on a Tacoma, done in the customer's driveway" },
      { scene: "suspension-new", caption: "Front end links and bushings on an SUV" },
      { scene: "wiper-new", caption: "Fresh blades before monsoon season" },
      { scene: "wheel-new", caption: "Wheel torqued in a star pattern after a rotor swap" },
    ],
  },
  {
    email: EMAIL.valley,
    daysAgo: 200,
    photos: [
      { scene: "scan-tool", caption: "Every diagnosis starts with live data" },
      { scene: "brake-worn", caption: "What a seized caliper does to a rotor" },
      { scene: "coils-new", caption: "New ignition coils after a misfire diagnosis" },
    ],
  },
  {
    email: EMAIL.kenji,
    daysAgo: 60,
    photos: [
      { scene: "battery-new", caption: "No-start fixed: new battery, charging system tested" },
      { scene: "headlight-on", caption: "Both low beams replaced and aimed" },
      { scene: "dash-all-clear", caption: "Sensor replaced and codes cleared" },
    ],
  },
  {
    email: EMAIL.rosa,
    daysAgo: 120,
    photos: [
      { scene: "wiper-new", caption: "Wiper blades swapped at 7 AM before the commute" },
      { scene: "filter-compare", caption: "Air filter change during an oil service" },
      { scene: "battery-new", caption: "Battery replacement at a customer's office lot" },
    ],
  },
  {
    email: EMAIL.westside,
    daysAgo: 180,
    photos: [
      { scene: "brake-new", caption: "Front brake job with new hardware" },
      { scene: "wheel-silver", caption: "Free brake inspection with every oil change" },
      { scene: "suspension-worn", caption: "Worn end link we found during an inspection" },
    ],
  },
];

type BookingPhotoPlan = {
  booking: (booked: BookedScenarios) => string;
  by: SampleEmail;
  phase: "before" | "after" | "other";
  at: (clock: SeedClock, booked: BookedScenarios) => Date;
  photos: ReadonlyArray<{ scene: SceneKey; caption: string; fileName: string }>;
};

/** Before/after photos, each added by the booking's customer or mechanic. */
const BOOKING_PHOTOS: readonly BookingPhotoPlan[] = [
  {
    booking: (booked) => booked.completedInvoiced.bookingId,
    by: EMAIL.dana,
    phase: "before",
    at: (clock) => clock.at(-1, "10:20"),
    photos: [{ scene: "wiper-worn", caption: "The old blades smearing in last week's rain", fileName: "outback-old-wipers.jpg" }],
  },
  {
    booking: (booked) => booked.completedInvoiced.bookingId,
    by: EMAIL.marco,
    phase: "after",
    at: (clock) => clock.at(-1, "11:05"),
    photos: [
      { scene: "wiper-new", caption: "New front blades fitted and tested", fileName: "outback-new-wipers.jpg" },
      { scene: "dash-all-clear", caption: "Oil-life reset to 100%", fileName: "outback-oil-reset.jpg" },
    ],
  },
  {
    booking: (booked) => booked.completedReviewed.bookingId,
    by: EMAIL.sam,
    phase: "before",
    at: (clock) => clock.onDate(clock.weekdayOnOrBefore(-6), "08:40"),
    photos: [{ scene: "suspension-worn", caption: "Front-left end link: torn boot and play in the joint", fileName: "outback-end-link-before.jpg" }],
  },
  {
    booking: (booked) => booked.completedReviewed.bookingId,
    by: EMAIL.sam,
    phase: "after",
    at: (clock) => clock.onDate(clock.weekdayOnOrBefore(-6), "10:20"),
    photos: [{ scene: "suspension-new", caption: "Both end links replaced and torqued", fileName: "outback-end-link-after.jpg" }],
  },
  {
    booking: (booked) => booked.hannahBattery.bookingId,
    by: EMAIL.priya,
    phase: "before",
    at: (clock, booked) => clock.onDate(booked.hannahBattery.jobDay, "09:12"),
    photos: [{ scene: "battery-corroded", caption: "Heavy corrosion on the positive terminal", fileName: "elantra-battery-before.jpg" }],
  },
  {
    booking: (booked) => booked.hannahBattery.bookingId,
    by: EMAIL.priya,
    phase: "after",
    at: (clock, booked) => clock.onDate(booked.hannahBattery.jobDay, "09:55"),
    photos: [{ scene: "battery-new", caption: "New battery, cleaned cables and protected terminals", fileName: "elantra-battery-after.jpg" }],
  },
  {
    booking: (booked) => booked.omarBrakes.bookingId,
    by: EMAIL.sam,
    phase: "before",
    at: (clock, booked) => clock.onDate(booked.omarBrakes.jobDay, "14:20"),
    photos: [
      { scene: "brake-worn", caption: "Front-left rotor scored by the seized caliper", fileName: "f150-rotor-before.jpg" },
      { scene: "wheel-worn", caption: "Brake dust on the front-left wheel", fileName: "f150-wheel-before.jpg" },
    ],
  },
  {
    booking: (booked) => booked.graceService.bookingId,
    by: EMAIL.elena,
    phase: "after",
    at: (clock, booked) => clock.onDate(booked.graceService.jobDay, "10:38"),
    photos: [
      { scene: "wheel-silver", caption: "Tires rotated and set to 36 psi", fileName: "rx350-tires-after.jpg" },
      { scene: "driveway-ready", caption: "Ready for the road trip", fileName: "rx350-ready.jpg" },
    ],
  },
];

function daysAgo(clock: SeedClock, days: number, time: string): Date {
  return clock.at(-days, time);
}

export type MediaSummary = { avatars: number; galleryPhotos: number; bookingPhotos: number };

export async function seedMedia(run: SeedRun, accounts: SeedAccounts, booked: BookedScenarios): Promise<MediaSummary> {
  const { clock } = run;
  for (const { email, spec, daysAgo: days } of AVATARS) {
    const upload = await monogramPicture(spec, "user_avatar", `${spec.initials.toLowerCase()}-profile.png`);
    await setMyAvatar(run.ctxAt(daysAgo(clock, days, "20:30")), accounts.viewer(email), upload);
  }

  let galleryPhotos = 0;
  for (const gallery of GALLERIES) {
    const mechanic = accounts.viewer(gallery.email);
    for (const [index, photo] of gallery.photos.entries()) {
      // One photo every week or two, each with its own caption.
      const at = daysAgo(clock, Math.max(1, gallery.daysAgo - index * 11), "18:10");
      const upload = await samplePhoto({ scene: photo.scene, fileName: `${photo.scene}.jpg` }, "mechanic_gallery");
      await addGalleryPhotos(run.ctxAt(at), mechanic, { uploads: [upload], caption: photo.caption });
      galleryPhotos += 1;
    }
  }

  let bookingPhotos = 0;
  for (const plan of BOOKING_PHOTOS) {
    const viewer = accounts.viewer(plan.by);
    const bookingId = plan.booking(booked);
    for (const [index, photo] of plan.photos.entries()) {
      const at = new Date(plan.at(clock, booked).getTime() + index * 60_000);
      const upload = await samplePhoto({ scene: photo.scene, fileName: photo.fileName }, "booking_photo");
      await addBookingPhotos(run.ctxAt(at), viewer, { bookingId, phase: plan.phase, caption: photo.caption, uploads: [upload] });
      bookingPhotos += 1;
    }
  }

  run.log(`Pictures: ${AVATARS.length} profile pictures, ${galleryPhotos} work-gallery photos, ${bookingPhotos} booking photos.`);
  return { avatars: AVATARS.length, galleryPhotos, bookingPhotos };
}
