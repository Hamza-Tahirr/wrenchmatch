import { Film, Images } from "lucide-react";

import type { MediaPhoto } from "@/components/media/media-types";
import { PhotoGrid } from "@/components/media/photo-grid";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { Panel } from "../../../_components/hud";

/** Photos and video of the request: listed only for confirmed, in-progress, completed and disputed bookings. */
export function MediaSection({ booking }: { booking: MyBookingDetail }) {
  const { photoFileIds, videoFileId } = booking.media;
  if (photoFileIds.length === 0 && !videoFileId) return null;
  const photos: MediaPhoto[] = photoFileIds.map((fileId, index) => ({
    id: fileId,
    fileId,
    src: `/api/files/${fileId}`,
    width: null,
    height: null,
    caption: null,
    alt: `Customer photo ${index + 1} of ${photoFileIds.length}`,
  }));
  return (
    <Panel id="request-media" title="Customer photos and video" description="What the customer sent with the request." icon={<Images />} bodyClassName="space-y-4">
      {photos.length > 0 ? <PhotoGrid photos={photos} label="Customer photos of the problem" /> : null}
      {videoFileId ? (
        <figure className="space-y-2">
          <figcaption className="flex items-center gap-2 text-sm font-medium text-fg">
            <Film aria-hidden="true" className="size-4 text-neon-cyan" />
            Customer video
          </figcaption>
          <video controls preload="metadata" className="w-full rounded-xl border border-line" src={`/api/files/${videoFileId}`}>
            <a href={`/api/files/${videoFileId}`}>Download the customer&rsquo;s video</a>
          </video>
        </figure>
      ) : null}
    </Panel>
  );
}
