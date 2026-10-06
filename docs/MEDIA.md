# Pictures people add (media uploads)

Customers and mechanics can add their own pictures wherever it helps: a profile picture, more
photos on an open repair request, a mechanic's work gallery, and before/after photos on a
booking. This page lists what can be uploaded where, the limits, who sees what, and how the
areas place the drop-in components. Schema: `db/migrations/0003_media.sql`. Server code:
`src/server/media/**`. Components: `src/components/media/**`.

## What can be uploaded where

| Picture | Who adds it | Where | Limit | Stored as |
| --- | --- | --- | --- | --- |
| Profile picture | customers, admins | `/account/photo` (`<MyAvatar />`) | 1 (replacing deletes the old one) | `files.purpose = 'user_avatar'`, `users.avatar_file_id`; re-encoded at most 512 px |
| More request photos | the request's customer, while the request is open or quoted | request page (`<RequestPhotoAdder />`) | 8 photos per request in all (the ones sent with it included), 5 per upload | `request_photo` + `request_media` (shared like the originals); at most 2048 px |
| Work gallery | mechanics (any status, once they have applied) | `/mechanic/gallery` | 12 photos, optional caption (140 characters), mechanic's own order | `mechanic_gallery` + `files.purpose = 'mechanic_gallery'`; at most 1600 px |
| Booking photos | the booking's customer and mechanic, once the booking is confirmed (confirmed, in progress, completed, disputed) | booking pages (`<BookingPhotos />`) | 40 per booking, 10 per upload; phase before / after / other; optional caption | `booking_photos` + `files.purpose = 'booking_photo'`; at most 1600 px |

Mechanics keep using their **profile photo** (`/mechanic/profile`) as their face; they do not
get a separate profile picture.

Every picture: JPEG, PNG or WebP, **8 MB** each, identified by its bytes (not its name), decoded,
auto-rotated, resized, re-encoded as JPEG with **all metadata removed** (EXIF, GPS, ICC, XMP),
exactly like request photos (`prepareUpload` in `src/server/storage/uploads.ts`). HEIC gets the
"please export as JPEG" message. Every account may add **60 pictures per hour** in all
(`MEDIA_LIMITS.picturesPerHour`, counted in `rate_limits` under `media_pictures:*`). Limits live
in `src/server/config.ts` (`UPLOAD_LIMITS`, `MEDIA_LIMITS`). Files are only ever served by
`GET /api/files/[id]` after the policy check; nothing goes under `public/`.

## Who sees what (`canViewFile` in `src/server/storage/file-access.ts`)

Every file is visible to its uploader and to admins. Beyond that:

| Picture | Also visible to | Never visible to |
| --- | --- | --- |
| Customer's profile picture (current one only) | a mechanic with a **confirmed, in-progress, completed or disputed** booking with that customer | mechanics before that (matched or quoting), pending-payment or cancelled bookings, other customers |
| Request photos added later | same as the photos sent with the request: matched mechanics while approved; the booked mechanic | unmatched mechanics, suspended mechanics, other customers |
| Mechanic gallery photo | customers who received a quote from that mechanic or are booked with them (the profile-photo rule) | other customers, other mechanics, signed-out visitors |
| Booking photo | the booking's customer; the booking's mechanic while the booking is confirmed or later (if it is cancelled afterwards, the mechanic keeps only their own uploads) | everyone else |

Unauthorized requests get the same 404 as a missing file. Lists returned by the media queries
apply the same rules, so a page never links a picture its viewer cannot open.

## Drop-in components (Server Components; render them from a server page or layout)

They fetch their own data with the signed-in viewer and render **nothing** when the viewer
may not use them, so areas can place them unconditionally. They are async: wrap them in
`<Suspense>` when you want the rest of the page to stream first, e.g.
`<Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>…</Suspense>`. They cannot
be imported into a Client Component; pass them as `children`/a prop from the server parent.

```tsx
import { RequestPhotoAdder } from "@/components/media/request-photo-adder";
import { RequestPhotoGallery } from "@/components/media/request-photo-gallery";
import { BookingPhotos } from "@/components/media/booking-photos";
import { MechanicGalleryStrip } from "@/components/media/mechanic-gallery-strip";
import { MyAvatar } from "@/components/media/my-avatar";
```

| Component | Place it on | Props |
| --- | --- | --- |
| `<RequestPhotoAdder requestId={request.id} />` | customer `/requests/[id]` | `requestId`; `showPhotos?` (also list the current photos, default false); `className?`. Glass panel with a "3/8 photos" meter and the uploader; hidden once the request is no longer open or quoted. |
| `<RequestPhotoGallery requestId={id} />` | anywhere the request's photos are shown: customer request page, mechanic `/mechanic/jobs/[requestId]`, booking pages, admin request page | `requestId`; `layout?: "grid" \| "strip"`; `label?`; `className?`. Tiles + full-screen viewer, only the photos this viewer may see. |
| `<BookingPhotos bookingId={id} viewerRole="customer" />` | customer `/bookings/[id]` | `bookingId`; `viewerRole: "customer" \| "mechanic" \| "admin"` (wording only); `className?`. Before / after / other groups, uploader with phase + caption, remove for own photos; explains why photos can't be added on a pending reservation. |
| `<BookingPhotos bookingId={id} viewerRole="mechanic" />` | mechanic `/mechanic/bookings/[id]` | as above (defaults the phase to "after" for mechanics). |
| `<MechanicGalleryStrip mechanicId={quote.mechanicId} />` | customer quote cards / comparison, booking pages, mechanic profile preview (`layout="grid"`), admin mechanic page | `mechanicId`; `title?: string \| null` (default "Recent work"); `layout?: "strip" \| "grid"`; `className?`. Swipeable row of work photos; nothing when empty or not allowed. |
| `<MyAvatar />` | `/account/photo` (done); an admin page if wanted | `className?`. Round neon preview, choose / drop / preview / save / remove. For mechanics it renders a link to `/mechanic/profile`. |

Pages owned by media: **`/account/photo`** (customer profile picture; link to it from
`/account`, e.g. `<ButtonLink href="/account/photo" variant="secondary">Profile picture</ButtonLink>`)
and **`/mechanic/gallery`** (gallery manager: upload, captions, drag or button reorder,
remove; link to it from `/mechanic/profile` and the job board, e.g. "Work gallery").

### Header avatar (design system)

Not wired yet: `src/app/layout.tsx` passes only `role` and `displayName` to `SiteHeader`, so the
header shows initials. To show pictures, add `avatarSrc: string | null` to `SiteHeaderViewer`,
fill it in the root layout as below, and pass `src={viewer.avatarSrc}` to both `<Avatar>`s in
`src/components/layout/site-header.tsx` (desktop and mobile menu).

```ts
import { getHeaderAvatarSrc } from "@/server/media/avatar";
const avatarSrc = viewer ? await getHeaderAvatarSrc(createAppContext(), viewer) : null;
// <Avatar name={viewer.displayName} src={avatarSrc} />  (src is "/api/files/<id>" or null → initials)
```

It returns the mechanic's profile photo for mechanics and the profile picture for everyone
else. Setting or removing a picture calls `revalidatePath("/", "layout")`, so the header
updates on the next render.

A booked mechanic can show the customer's picture with
`getVisibleAvatarSrc(ctx, viewer, customerId)` (null unless the policy allows it).

### Client building blocks (`"use client"`, for custom layouts)

| Component | Use |
| --- | --- |
| `Dropzone` (`dropzone.tsx`) | `action` (a media Server Action), `fields?` (hidden inputs), `maxFiles`, `maxBytes`, `label`, `hint?`, `submitVerb?`, `compact?`, `children?` (extra form controls). Drag and drop, paste, click; previews with remove; early type/size/count checks (HEIC message); progress bar while uploading; live-region results and toasts. |
| `PhotoGrid` (`photo-grid.tsx`) | `photos: MediaPhoto[]`, `label`, `layout?: "grid" \| "strip"`, `removeAction?` + `removableIds?`, `badges?`, `empty?`. Tiles open the `Lightbox`. |
| `Lightbox` (`lightbox.tsx`) | Native `<dialog>` viewer: zooms out of the thumbnail, arrows / Home / End / swipe, double-click or double-tap or Z to zoom and pan, swipe down or Esc to close, captions, thumbnail rail. |
| `TileImage` (`tile-image.tsx`) | `photo: MediaPhoto`, `className?`. A lazy photo filling a `relative overflow-hidden` tile over a shimmering placeholder that is removed once the picture loads (or fails); used by `PhotoGrid` and `GalleryManager`. |
| `AvatarUploader`, `GalleryManager` | Used by `<MyAvatar />` and `/mechanic/gallery`. After a save, the new picture replaces the preview in place (no blank frame while the stored copy loads). |

Shared types and constants: `src/components/media/media-types.ts` (`MediaPhoto`,
`BookingPhotoView`, `GalleryPhotoView`, `MediaActionState`, `PHOTO_FIELD = "photos"`, phases).

## Server API (`src/server/media`, all `(ctx, viewer, input)`, re-checking role and ownership)

| Module | Functions |
| --- | --- |
| `avatar.ts` | `getMyAvatar`, `getHeaderAvatarSrc`, `getVisibleAvatarSrc`, `setMyAvatar(upload)`, `removeMyAvatar` |
| `request-photos.ts` | `getRequestPhotoAllowance(requestId)`, `listRequestPhotos(requestId)`, `addRequestPhotos({ requestId, uploads })` |
| `gallery.ts` | `getMyGalleryOverview`, `listMyGallery`, `listMechanicGallery(mechanicId)`, `addGalleryPhotos({ uploads, caption? })`, `updateGalleryCaption({ photoId, caption })`, `reorderGallery({ photoIds })`, `moveGalleryPhoto({ photoId, direction })`, `removeGalleryPhoto({ photoId })` |
| `booking-photos.ts` | `getBookingPhotos(bookingId)`, `addBookingPhotos({ bookingId, phase, caption?, uploads })`, `removeBookingPhoto({ photoId })` (own uploads only) |
| `prepare.ts` | `preparePictures(formData, purpose, { maxFiles })` (outside transactions; sharp is slow) |
| `actions.ts` (`"use server"`) | `setMyAvatarAction`, `removeMyAvatarAction`, `addRequestPhotosAction`, `addGalleryPhotosAction`, `updateGalleryCaptionAction`, `reorderGalleryAction`, `moveGalleryPhotoAction`, `removeGalleryPhotoAction`, `addBookingPhotosAction`, `removeBookingPhotoAction`. Signature `(state: MediaActionState, formData) => Promise<MediaActionState>`; files in `"photos"`; they call `refresh()` so the page they were used on re-renders. |

Unknown or foreign ids answer `not_found`. Database guards (0003): `files.purpose` CHECK with
the three new purposes (images only, metadata stripped); a booking photo can only be inserted
for a confirmed (or later) booking, by its customer or mechanic, with their own
`booking_photo` file (trigger `booking_photos_require_confirmed_booking`); gallery and booking
photos never move to another mechanic, booking, file or uploader (triggers); caption length
CHECKs. The 0003 migration rebuilds `files` with SQLite's 12-step procedure, so its first
line is `-- migrate:foreign-keys-off` (see `src/server/db/migrate.ts`).

**Notifications** (in-app, no contact details): `request.photos_added` to the request's matched,
approved mechanics who have not passed (link `/mechanic/jobs/<requestId>`);
`booking.photos_added` to the other party of the booking (customer `/bookings/<id>`, mechanic
`/mechanic/bookings/<id>`). **Audit actions:** `account.avatar_set`, `account.avatar_remove`,
`request.photos_add`, `mechanic.gallery_add`, `mechanic.gallery_caption`,
`mechanic.gallery_remove`, `booking.photos_add`, `booking.photo_remove`.

## Seeding pictures

Seed scripts can call the domain functions with `prepareUpload` output (e.g.
`addGalleryPhotos(ctx, mechanicViewer, { uploads })`), or insert `files` rows with the purposes
above plus the `mechanic_gallery` / `booking_photos` rows and `users.avatar_file_id`. Booking
photos need a booking that is already confirmed or later (seeded fixtures are inserted in
those states). Only original artwork; no pictures of real people.
