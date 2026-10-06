import { Camera, EyeOff, ImageOff } from "lucide-react";
import { Suspense } from "react";

import { RequestPhotoGallery } from "@/components/media/request-photo-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralize } from "@/lib/format";
import type { JobDetail } from "@/server/mechanic/jobs";

import { Panel } from "../../../_components/hud";

/** Sanitized photos the customer shared (full-screen viewer); the video stays private until a confirmed booking. */
export function PhotosSection({ job }: { job: JobDetail }) {
  const count = job.photos.length;
  return (
    <Panel
      id="job-photos"
      title="Photos"
      icon={<Camera />}
      description={count > 0 ? `${pluralize(count, "photo")} from the customer, location data removed. Tap one to open it full screen.` : undefined}
      bodyClassName="space-y-4"
    >
      {count > 0 ? (
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {job.photos.map((photo) => (
                <Skeleton key={photo.fileId} className="aspect-[4/3] rounded-xl" />
              ))}
            </div>
          }
        >
          <RequestPhotoGallery requestId={job.requestId} label={`Customer photos of the ${job.vehicle.label}`} />
        </Suspense>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm text-fg-muted">
          <ImageOff aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          The customer didn&rsquo;t share photos.
        </p>
      )}
      {job.videoNotice ? (
        <div className="flex gap-3 rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 p-4">
          <EyeOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neon-cyan" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-fg">The customer attached a video - available after a confirmed booking</p>
            <p className="text-sm text-fg-muted">
              Videos can&rsquo;t be cleaned of location data, so they stay private until the booking is confirmed.
            </p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
