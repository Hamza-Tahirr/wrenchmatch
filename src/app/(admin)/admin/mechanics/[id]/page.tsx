import { History, Images, Lock, MapPinned, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MapView, approximateArea, type MapCircle } from "@/components/map";
import { PhotoGrid } from "@/components/media/photo-grid";
import type { GalleryPhotoView } from "@/components/media/media-types";
import { getMechanic, type AdminMechanicDetail } from "@/server/admin/mechanics";
import { isDomainError } from "@/server/errors";
import { listMechanicGallery } from "@/server/media/gallery";

import { AuditEventList } from "../../_components/audit-event-list";
import { MechanicStatusBadge, NeonChip } from "../../_components/badges";
import { ClientAvatar } from "../../_components/client-avatar";
import { ConsoleBackLink, ConsoleHeader, ConsoleNote, Panel } from "../../_components/console";
import { MapKey } from "../../_components/maps/map-key";
import { MechanicRevealDialog } from "../../_components/reveal-dialog";
import { StatusSwap } from "../../_components/status-swap";
import { mechanicModeLabel } from "../../_lib/display";
import { adminPage } from "../../_lib/page-context";
import {
  changeMechanicStatusAction,
  revealMechanicPrivateAction,
  reviewDocumentAction,
  setSafetyApprovalAction,
} from "./actions";
import { DocumentsCard } from "./_components/documents-card";
import { ActivityCard, InsuranceCard, ProfileCard } from "./_components/profile-cards";
import { ServicesCard } from "./_components/services-card";
import { DecisionBar, StatusPanel } from "./_components/status-panel";

export const metadata: Metadata = { title: "Mechanic review" };

type PageProps = { params: Promise<{ id: string }> };

async function loadMechanic(path: string, id: string) {
  const { viewer, ctx, shell } = await adminPage(path);
  let mechanic: AdminMechanicDetail;
  try {
    mechanic = await getMechanic(ctx, viewer, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const gallery: GalleryPhotoView[] = await listMechanicGallery(ctx, viewer, mechanic.id);
  return { mechanic, gallery, ctx, shell };
}

function PrivateDetailsPanel({ mechanic, timeZone }: { mechanic: AdminMechanicDetail; timeZone: string }) {
  return (
    <Panel title="Private details" icon={<Lock />} tone="violet">
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          Legal and business name, phone, contact email, garage address and policy number are hidden. Customers see contact
          details only after a confirmed booking; each admin reveal is audited.
        </p>
        {mechanic.hasPrivateDetails ? (
          <MechanicRevealDialog
            mechanicId={mechanic.id}
            displayName={mechanic.profile.displayName}
            timeZone={timeZone}
            action={revealMechanicPrivateAction}
          />
        ) : (
          <p className="text-sm text-fg-subtle">No private details are on file yet (the application is incomplete).</p>
        )}
      </div>
    </Panel>
  );
}

function CoveragePanel({ mechanic }: { mechanic: AdminMechanicDetail }) {
  const { profile } = mechanic;
  const travels = profile.serviceMode !== "garage";
  const circles: MapCircle[] = [
    approximateArea(profile.baseLocation, { id: "base-area", tone: "violet", label: `Base area: ${profile.baseArea}` }),
    ...(travels
      ? [
          {
            id: "travel-radius",
            lat: profile.baseLocation.lat,
            lng: profile.baseLocation.lng,
            radiusMiles: profile.travelRadiusMiles,
            tone: "violet" as const,
            dashed: true,
            label: `Travels up to ${profile.travelRadiusMiles} mi for mobile work`,
          },
        ]
      : []),
  ];
  return (
    <Panel
      title="Service area"
      icon={<MapPinned />}
      tone="violet"
      description={`${mechanicModeLabel(profile.serviceMode)} · based in ${profile.baseArea}${
        travels ? ` · travels up to ${profile.travelRadiusMiles} mi` : ""
      }. The base is the ZIP's approximate center, never the garage address.`}
    >
      <MapView
        label={`${profile.displayName}'s approximate base area${travels ? " and travel radius" : ""}`}
        points={[
          {
            id: "base",
            lat: profile.baseLocation.lat,
            lng: profile.baseLocation.lng,
            label: profile.displayName,
            description: `Base ZIP ${profile.baseZip} · ${profile.baseArea}`,
            tone: "violet",
            kind: "home",
            pulse: true,
          },
        ]}
        circles={circles}
        cluster={false}
        height="clamp(14rem, min(40vh, 80vw), 22rem)"
        fitMaxZoom={11}
        list="sr-only"
        listTitle="Base area and travel radius"
      />
      <MapKey
        className="mt-2"
        items={[
          { tone: "violet", label: "Base (ZIP area)", kind: "home" },
          ...(travels ? [{ tone: "violet" as const, label: "Travel radius", kind: "ring" as const }] : []),
        ]}
      />
    </Panel>
  );
}

export default async function MechanicReviewPage({ params }: PageProps) {
  const { id } = await params;
  const path = `/admin/mechanics/${encodeURIComponent(id)}`;
  const { mechanic, gallery, ctx, shell } = await loadMechanic(path, id);
  const timeZone = shell.reportingTimeZone;
  const name = mechanic.profile.displayName;
  const photoSrc = mechanic.profile.profilePhotoFileId ? `/api/files/${mechanic.profile.profilePhotoFileId}` : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <ConsoleBackLink href="/admin/mechanics" label="All mechanics" />
        <div className="flex items-start gap-4 sm:items-center sm:gap-5">
          <div className="relative mt-1 w-fit shrink-0 animate-scale-in sm:mt-0">
            <span
              aria-hidden="true"
              className="absolute -inset-1.5 rounded-full bg-[conic-gradient(from_180deg,var(--color-neon-cyan),var(--color-neon-violet),var(--color-neon-cyan))] opacity-70 blur-[6px]"
            />
            <span className="relative block rounded-full ring-2 ring-canvas sm:hidden">
              <ClientAvatar name={name} src={photoSrc} size="lg" decorative />
            </span>
            <span className="relative hidden rounded-full ring-2 ring-canvas sm:block">
              <ClientAvatar name={name} src={photoSrc} size="xl" decorative />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <ConsoleHeader
              eyebrow="Admin / Mechanics / Review"
              title={name}
              meta={
                <>
                  <StatusSwap status={mechanic.status.current}>
                    <MechanicStatusBadge status={mechanic.status.current} />
                  </StatusSwap>
                  {mechanic.status.current === "approved" && !mechanic.profile.acceptingJobs ? (
                    <NeonChip tone="neutral">Paused new jobs</NeonChip>
                  ) : null}
                  <NeonChip tone="violet">{mechanicModeLabel(mechanic.profile.serviceMode)}</NeonChip>
                </>
              }
              description={
                <>
                  <span className="font-mono text-sm">{mechanic.account.email}</span> · based in {mechanic.profile.baseArea}
                </>
              }
            />
          </div>
        </div>
      </div>

      {mechanic.status.current === "approved" && mechanic.insurance.state === "expired" ? (
        <ConsoleNote icon={<TriangleAlert />} tone="danger" title="Insurance expired: excluded from matching">
          {name} is approved, but matching skips them until a current policy is on file. Ask them to update their insurance, or
          suspend them while it is sorted out.
        </ConsoleNote>
      ) : null}

      {/* On phones the profile panels come before the (long) history; from xl they form the right column. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-[auto_1fr] xl:items-start">
        <div className="min-w-0 space-y-6">
          <StatusPanel mechanic={mechanic} timeZone={timeZone} action={changeMechanicStatusAction} />
          <DocumentsCard documents={mechanic.documents} mechanicName={name} timeZone={timeZone} action={reviewDocumentAction} />
          <ServicesCard mechanic={mechanic} timeZone={timeZone} action={setSafetyApprovalAction} />
          <Panel
            title={`Work gallery (${gallery.length})`}
            icon={<Images />}
            description="Photos the mechanic added to their profile. Customers see them once this mechanic quotes on their request."
          >
            <PhotoGrid
              photos={gallery}
              label={`${name}'s work gallery`}
              layout="grid"
              empty={<p className="text-sm text-fg-subtle">No work photos yet. Mechanics add them from their profile.</p>}
            />
          </Panel>
        </div>
        <div className="min-w-0 space-y-6 xl:row-span-2">
          <CoveragePanel mechanic={mechanic} />
          <ProfileCard mechanic={mechanic} timeZone={timeZone} />
          <InsuranceCard mechanic={mechanic} />
          <PrivateDetailsPanel mechanic={mechanic} timeZone={timeZone} />
          <ActivityCard mechanic={mechanic} />
        </div>
        <div className="min-w-0 xl:col-start-1">
          <Panel
            title="History"
            icon={<History />}
            tone="violet"
            description="Status changes, document reviews, approvals, reveals and the mechanic's own actions, newest first."
          >
            {mechanic.history.length > 0 ? (
              <AuditEventList
                events={mechanic.history}
                label={`History of ${name}, newest first`}
                timeZone={timeZone}
                now={ctx.now}
                selfHref={`/admin/mechanics/${mechanic.id}`}
              />
            ) : (
              <p className="text-sm text-fg-subtle">No recorded events yet.</p>
            )}
          </Panel>
        </div>
      </div>
      <DecisionBar mechanic={mechanic} action={changeMechanicStatusAction} />
    </div>
  );
}
