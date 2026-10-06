import { CalendarDays, Car, ChevronDown, FileCheck, Gauge, ImageIcon, Lock, MapPin, Truck, Video, Wrench } from "lucide-react";
import { Suspense } from "react";

import { RequestPhotoGallery } from "@/components/media/request-photo-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { DescriptionList } from "@/components/ui/description-list";
import { formatDateTime, pluralize } from "@/lib/format";
import type { RequestDetail, RequestMediaItem } from "@/server/customer/request-views";

import { DetailGrid, DetailItem, InlineNote, Panel } from "../../../_components/facts";
import { formatCalendarDate } from "../../../_lib/display";

function VideoClip({ video }: { video: RequestMediaItem }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Video aria-hidden="true" className="size-4 text-neon-cyan" />
        Your video
      </h3>
      <video controls preload="metadata" className="aspect-video w-full rounded-2xl border border-line" src={video.url}>
        <a href={video.url}>Download the video</a>
      </video>
      <InlineNote icon={<Lock />}>
        Private: mechanics can watch it only after a booking is confirmed, because videos can contain location data
        we can&rsquo;t remove.
      </InlineNote>
    </div>
  );
}

/** The request as the customer sent it, with their own private details and consent record. */
export function RequestDetails({ request }: { request: RequestDetail }) {
  const photoCount = request.media.filter((item) => item.kind === "photo").length;
  const video = request.media.find((item) => item.kind === "video");
  const contact = request.contact;
  const address = contact
    ? [contact.streetAddress, [contact.city, contact.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")
    : "";

  return (
    <Panel
      title="Request details"
      titleId="request-details-title"
      eyebrow="What you sent"
      description={request.submittedAt ? `Sent ${formatDateTime(request.submittedAt, request.timeZone)}` : null}
      bodyClassName="space-y-6"
    >
      <blockquote className="rounded-2xl border-l-2 border-neon-cyan/70 bg-surface-2/50 px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">The problem</p>
        <p className="mt-1 whitespace-pre-line text-pretty text-fg">{request.description}</p>
      </blockquote>
      <DetailGrid>
        <DetailItem icon={<Car />} label="Vehicle">
          {request.vehicle.label}
          <span className="block font-mono text-xs text-fg-subtle tabular">{request.vehicle.mileage.toLocaleString("en-US")} miles</span>
        </DetailItem>
        <DetailItem icon={<Wrench />} label="Service">
          {request.categoryName}
        </DetailItem>
        <DetailItem icon={<Gauge />} label="Can it be driven?">
          {request.drivable ? "Yes" : "No, it can't be driven"}
        </DetailItem>
        <DetailItem icon={<CalendarDays />} label="Preferred time">
          {formatCalendarDate(request.preferredDate)}
          <span className="block text-fg-muted">{request.preferredWindowLabel}</span>
        </DetailItem>
        <DetailItem icon={<Truck />} label="Where">
          {request.serviceMode === "either" ? "Mobile or at a garage" : request.serviceModeLabel}
          {request.serviceMode !== "mobile" ? (
            <span className="block text-fg-muted">
              Garages up to about {pluralize(request.maxGarageDistanceMiles, "mile")} away
            </span>
          ) : null}
        </DetailItem>
        <DetailItem icon={<MapPin />} label="Approximate area">
          {request.areaLabel}
          <span className="block text-fg-muted">What matched mechanics see until a booking is confirmed</span>
        </DetailItem>
      </DetailGrid>

      <div className="space-y-5 border-t border-line pt-5">
        {photoCount > 0 ? (
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <ImageIcon aria-hidden="true" className="size-4 text-neon-cyan" />
              Your photos <span className="font-mono text-xs font-normal text-fg-subtle tabular">{photoCount}</span>
            </h3>
            <Suspense fallback={<Skeleton className="h-28 rounded-2xl" />}>
              <RequestPhotoGallery requestId={request.id} label="Your photos of the problem" />
            </Suspense>
            <InlineNote icon={<FileCheck />}>
              Shared with the matched mechanics after location and camera data were removed.
            </InlineNote>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">You didn&rsquo;t add photos{video ? "" : " or a video"}.</p>
        )}
        {video ? <VideoClip video={video} /> : null}
      </div>

      {contact ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-2/50 p-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Lock aria-hidden="true" className="size-4 text-neon-cyan" />
              Your private details
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              Only you can see these now. The mechanic you book sees them once the booking is confirmed.
            </p>
          </div>
          <DescriptionList
            layout="grid"
            items={[
              { term: "Phone", description: contact.phone },
              { term: "Email", description: contact.email },
              { term: "Address", description: address || "Not given" },
              { term: "Location notes", description: contact.locationNotes ?? "None" },
            ]}
          />
        </div>
      ) : null}

      {request.consent ? (
        <details className="group rounded-2xl border border-line">
          <summary className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-fg/5">
            <span>
              Agreements you accepted{" "}
              <span className="font-normal text-fg-subtle">({formatDateTime(request.consent.acceptedAt, request.timeZone)})</span>
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-line px-4 py-3 text-sm text-fg-muted">
            <ul className="list-disc space-y-1.5 pl-5">
              {request.consent.items.map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
            <p className="font-mono text-xs text-fg-subtle">Consent version {request.consent.version}</p>
          </div>
        </details>
      ) : null}
    </Panel>
  );
}
