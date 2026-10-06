import { Camera, ClipboardList, LifeBuoy, Lock, MapPinned, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PhotoGrid } from "@/components/media/photo-grid";
import type { BookingPhotoView, MediaPhoto } from "@/components/media/media-types";
import { formatBytes, formatDate, pluralize } from "@/lib/format";
import { getRequest, type AdminRequestDetail } from "@/server/admin/requests";
import { MAX_MECHANICS_NOTIFIED } from "@/server/config";
import { isDomainError } from "@/server/errors";
import { getBookingPhotos } from "@/server/media/booking-photos";

import { BookingStatusBadge, NeonChip, RequestStatusBadge, SupportStatusBadge } from "../../_components/badges";
import { ConsentRecord } from "../../_components/consent-record";
import { ConsoleHeader, ConsoleLink, ConsoleNote, FactGrid, Panel } from "../../_components/console";
import { RequestRevealDialog } from "../../_components/reveal-dialog";
import { Timestamp } from "../../_components/timestamp";
import { requestModeLabel, windowLabel } from "../../_lib/display";
import { adminPage } from "../../_lib/page-context";
import { revealRequestContactAction, rerunMatchingAction } from "./actions";
import { BookingSection } from "./_components/booking-section";
import { MatchingSection } from "./_components/matching-section";
import { QuotesSection } from "./_components/quotes-section";

export const metadata: Metadata = { title: "Repair request" };

type PageProps = { params: Promise<{ id: string }> };

async function loadRequest(path: string, id: string) {
  const { viewer, ctx, shell } = await adminPage(path);
  let request: AdminRequestDetail;
  try {
    request = await getRequest(ctx, viewer, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }
  // Before/after photos are evidence for disputes; a booking without any shows none.
  let bookingPhotos: BookingPhotoView[] = [];
  if (request.booking) {
    try {
      bookingPhotos = (await getBookingPhotos(ctx, viewer, request.booking.id)).photos;
    } catch (error) {
      if (!isDomainError(error)) throw error;
    }
  }
  return { request, shell, bookingPhotos };
}

function MediaPanel({ request }: { request: AdminRequestDetail }) {
  const photos = request.media.filter((item) => item.kind === "photo");
  const videos = request.media.filter((item) => item.kind === "video");
  const gallery: MediaPhoto[] = photos.map((photo, index) => ({
    id: photo.fileId,
    fileId: photo.fileId,
    src: `/api/files/${photo.fileId}`,
    width: photo.width,
    height: photo.height,
    caption: null,
    alt: `Photo ${index + 1} of ${photos.length} from the customer`,
  }));
  return (
    <Panel
      title={`Photos and video (${request.media.length})`}
      icon={<Camera />}
      description="Photos were re-encoded with location and camera metadata removed. Video stays private until a confirmed booking."
    >
      <div className="space-y-5">
        {request.media.length === 0 ? (
          <p className="text-sm text-fg-subtle">The customer didn&rsquo;t add photos or a video.</p>
        ) : null}
        <PhotoGrid
          photos={gallery}
          label="Photos from the customer"
          layout="strip"
          badges={Object.fromEntries(
            photos.map((photo) => [photo.fileId, photo.shareableBeforeBooking ? "Shared with matched mechanics" : "Private"]),
          )}
        />
        {videos.map((video) => (
          <div key={video.fileId} className="space-y-2">
            <video
              controls
              preload="metadata"
              src={`/api/files/${video.fileId}`}
              className="aspect-video w-full rounded-xl border border-line-strong bg-canvas shadow-[var(--shadow-glow-sm)]"
            >
              <a href={`/api/files/${video.fileId}`}>Download the video</a>
            </video>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
              <NeonChip tone="warning" icon={<Lock />}>
                Private until a confirmed booking
              </NeonChip>
              <span className="font-mono">{formatBytes(video.sizeBytes)}</span>
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ContactPanel({ request, timeZone }: { request: AdminRequestDetail; timeZone: string }) {
  return (
    <Panel title="Customer contact" icon={<Lock />} tone="violet">
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          Email, phone, exact address and location notes are hidden. Mechanics never see them before a confirmed booking;
          each admin reveal is recorded in the audit log with a reason.
        </p>
        <RequestRevealDialog requestId={request.id} timeZone={timeZone} action={revealRequestContactAction} />
      </div>
    </Panel>
  );
}

export default async function AdminRequestPage({ params }: PageProps) {
  const { id } = await params;
  const { request, shell, bookingPhotos } = await loadRequest(`/admin/requests/${encodeURIComponent(id)}`, id);
  const tz = request.timeZone;
  const summary = `${request.vehicle} · ${request.categoryName}`;

  return (
    <div className="space-y-6">
      <ConsoleHeader
        back={{ href: "/admin/requests", label: "All requests" }}
        eyebrow={`Admin / Requests / ${request.categoryName}`}
        title={request.vehicle}
        meta={
          <>
            <RequestStatusBadge status={request.status} />
            {request.bookingStatus ? <BookingStatusBadge status={request.bookingStatus} labelled /> : null}
            {request.categorySafetySensitive ? (
              <NeonChip tone="warning" icon={<ShieldAlert />}>
                Safety-sensitive
              </NeonChip>
            ) : null}
            <NeonChip tone={request.matchedCount === 0 ? "danger" : "info"} pulse={request.matchedCount === 0}>
              {pluralize(request.matchedCount, "mechanic")} notified
            </NeonChip>
          </>
        }
        description={
          <>
            {request.customer.displayName} · {request.areaLabel} ·{" "}
            {request.submittedAt ? (
              <>
                submitted <Timestamp iso={request.submittedAt} timeZone={tz} />
              </>
            ) : (
              "draft, not submitted"
            )}
          </>
        }
      />

      {!request.categoryEnabled ? (
        <ConsoleNote icon={<TriangleAlert />} tone="warning" title={`${request.categoryName} is disabled`}>
          <p>
            New requests can&rsquo;t use this category and matching can&rsquo;t be re-run for it. This request continues as it
            is. <ConsoleLink href="/admin/settings">Open settings</ConsoleLink>
          </p>
        </ConsoleNote>
      ) : null}
      {!request.zipPilotEnabled ? (
        <ConsoleNote icon={<MapPinned />} tone="warning" title={`ZIP ${request.zip} is not an enabled pilot ZIP`}>
          <p>
            Matching can&rsquo;t be re-run here until the ZIP is enabled. <ConsoleLink href="/admin/settings">Open settings</ConsoleLink>
          </p>
        </ConsoleNote>
      ) : null}
      {request.status !== request.storedStatus ? (
        <ConsoleNote tone="cyan">
          Shown as of now: the stored status ({request.storedStatus}) is updated the next time expiry runs.
        </ConsoleNote>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Request details" icon={<ClipboardList />} description="What the customer submitted (coarse location only).">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h3 className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Problem description</h3>
              <p className="rounded-xl border-l-2 border-neon-cyan/50 bg-fg/[0.025] px-4 py-3 text-sm text-pretty whitespace-pre-line text-fg">
                {request.description}
              </p>
            </div>
            <FactGrid
              items={[
                {
                  term: "Vehicle",
                  description: `${request.vehicle}, ${request.mileage.toLocaleString("en-US")} miles`,
                  wide: true,
                },
                { term: "Drivable", description: request.drivable ? "Yes" : "No, needs a mobile mechanic or a tow" },
                {
                  term: "Service",
                  description: `${requestModeLabel(request.serviceMode)}${
                    request.serviceMode !== "mobile" ? ` (garage within ${request.maxGarageDistanceMiles} mi)` : ""
                  }`,
                },
                {
                  term: "Preferred time",
                  description: `${formatDate(request.preferredDate)} · ${windowLabel(request.preferredWindow)}`,
                  wide: true,
                },
                { term: "Area", description: `${request.areaLabel} (time zone ${tz})`, wide: true },
                { term: "Quotes", description: `${request.quotesCount} (${request.activeQuotesCount} still selectable)` },
                { term: "Mechanics notified", description: pluralize(request.matchedCount, "mechanic") },
                {
                  term: "Expires",
                  description: request.expiresAt ? <Timestamp iso={request.expiresAt} timeZone={tz} /> : "Not submitted",
                  wide: true,
                },
              ]}
            />
            <ConsentRecord consent={request.consent} title="Request consent" timeZone={tz} />
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          <ContactPanel request={request} timeZone={shell.reportingTimeZone} />
          <MediaPanel request={request} />
          <Panel title="Help requests" icon={<LifeBuoy />} tone={request.supportRequests.some((item) => item.status === "open") ? "warning" : "cyan"}>
            {request.supportRequests.length > 0 ? (
              <ul className="space-y-3">
                {request.supportRequests.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-fg">{item.topicLabel}</span>
                    <SupportStatusBadge status={item.status} />
                    <span className="text-xs text-fg-subtle">
                      <Timestamp iso={item.createdAt} timeZone={shell.reportingTimeZone} format="date" />
                    </span>
                  </li>
                ))}
                <li>
                  <Link href="/admin/support" className="text-sm font-medium text-brand-700 underline-offset-4 hover:text-neon-cyan hover:underline">
                    Open the help desk
                  </Link>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-fg-subtle">No help requests about this repair.</p>
            )}
          </Panel>
        </div>
      </div>

      {request.booking ? <BookingSection booking={request.booking} summary={summary} photos={bookingPhotos} /> : null}
      <MatchingSection request={request} action={rerunMatchingAction} maxNotified={MAX_MECHANICS_NOTIFIED} />
      <QuotesSection quotes={request.quotes} />
    </div>
  );
}
