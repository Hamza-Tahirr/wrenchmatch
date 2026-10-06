import { Eye, Lightbulb, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UploadPhotos } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Dropzone } from "@/components/media/dropzone";
import { GalleryManager } from "@/components/media/gallery-manager";
import { requireRole } from "@/server/auth/viewer";
import { MEDIA_LIMITS, UPLOAD_LIMITS } from "@/server/config";
import { createAppContext } from "@/server/context";
import {
  addGalleryPhotosAction,
  moveGalleryPhotoAction,
  removeGalleryPhotoAction,
  reorderGalleryAction,
  updateGalleryCaptionAction,
} from "@/server/media/actions";
import { getMyGalleryOverview } from "@/server/media/gallery";
import { uploadBudgetFor } from "@/server/storage/config";

import { MechanicHero } from "../_components/hud";
import { TAP_BUTTONS } from "../_components/tap";

export const metadata: Metadata = { title: "Work gallery" };

const TIPS = [
  "Well-lit photos of finished work: a clean engine bay, new pads and rotors, a tidy repair.",
  "Leave out licence plates, faces and house numbers. Hidden data like GPS location is removed for you.",
  "A short caption says what was done, e.g. “Front brake pads and rotors replaced”.",
] as const;

export default async function MechanicGalleryPage() {
  const viewer = await requireRole("mechanic", "/mechanic/gallery");
  const gallery = await getMyGalleryOverview(createAppContext(), viewer);
  if (!gallery.hasProfile) redirect("/mechanic/apply");
  const count = gallery.photos.length;

  return (
    <PageContainer size="wide">
      <MechanicHero
        back={{ href: "/mechanic/profile", label: "Your profile" }}
        eyebrow="Mechanic profile"
        title="Work gallery"
        description="Show customers the quality of your work. Customers who receive a quote from you see these photos with it."
        meta={
          <span className="rounded-full border border-line bg-surface-2/70 px-3 py-1 font-mono text-xs text-fg-muted tabular">
            {count}/{gallery.limit} photos
          </span>
        }
      />

      {/* DOM order is the phone order: add photos, your photos, then who sees them and tips. On
          wide screens the photos fill the left column and the rest sits on the right. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8">
        <section aria-labelledby="gallery-add" className="glass rounded-2xl p-5 lg:col-start-2 lg:row-start-1">
          <h2 id="gallery-add" className="text-base font-semibold text-fg">
            Add photos
          </h2>
          {gallery.remaining > 0 ? (
            <Dropzone
              action={addGalleryPhotosAction}
              maxFiles={gallery.perUpload}
              maxBytes={UPLOAD_LIMITS.mechanic_gallery.maxBytes}
              budget={uploadBudgetFor("mechanic_gallery")}
              label="Drop work photos here"
              hint="Or choose photos, or paste them."
              submitVerb="Add"
              compact
              className="mt-4"
            />
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              Your gallery is full ({gallery.limit} photos). Remove one to add another.
            </p>
          )}
        </section>

        <section aria-labelledby="gallery-photos" className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <h2 id="gallery-photos" className="sr-only">
            Your photos
          </h2>
          {count > 0 ? (
            <div className={TAP_BUTTONS}>
              <GalleryManager
                photos={gallery.photos}
                captionMaxLength={MEDIA_LIMITS.captionMaxLength}
                captionAction={updateGalleryCaptionAction}
                moveAction={moveGalleryPhotoAction}
                reorderAction={reorderGalleryAction}
                removeAction={removeGalleryPhotoAction}
              />
            </div>
          ) : (
            <div className="glass grid place-items-center gap-4 rounded-3xl px-6 py-12 text-center">
              <UploadPhotos decorative className="w-48 sm:w-56" />
              <div className="max-w-md space-y-2">
                <p className="text-lg font-semibold text-fg">No work photos yet</p>
                <p className="text-sm text-fg-muted">
                  Add up to {gallery.limit} photos of jobs you are proud of. They appear on the quotes you send, so customers can
                  see your work before they choose.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6 lg:col-start-2 lg:row-start-2" aria-label="Who sees your photos and tips">
          <section aria-labelledby="gallery-audience" className="glass-lite space-y-3 rounded-2xl p-5">
            <h2 id="gallery-audience" className="flex items-center gap-2 text-base font-semibold text-fg">
              <Eye aria-hidden="true" className="size-4 text-neon-cyan" /> Who sees your gallery
            </h2>
            <p className="text-sm text-fg-muted">
              Customers you send a quote to or are booked with, and the WrenchMatch team. It is never shown publicly.
            </p>
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-700" />
              Every photo is resized and stripped of hidden data, GPS location included.
            </p>
          </section>

          <section aria-labelledby="gallery-tips" className="glass-lite space-y-3 rounded-2xl p-5">
            <h2 id="gallery-tips" className="flex items-center gap-2 text-base font-semibold text-fg">
              <Lightbulb aria-hidden="true" className="size-4 text-neon-violet" /> Photos that win jobs
            </h2>
            <ul className="space-y-2 text-sm text-fg-muted">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-neon-cyan" />
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}
