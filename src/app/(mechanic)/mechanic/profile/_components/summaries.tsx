import { Download, Eye, FileText, ImageIcon, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { DescriptionList } from "@/components/ui/description-list";
import { formatBytes, formatDate } from "@/lib/format";
import { formatTimeRange, WEEKDAYS } from "@/lib/validation/mechanic";
import type { MechanicFormOptions } from "@/server/mechanic/form-options";
import type { MyMechanicProfile } from "@/server/mechanic/profile";

import { ServiceAreaMap } from "../../_components/service-area-map";

// Read-only views of the profile sections (shown when a section isn't being edited).

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs font-semibold tracking-[0.16em] text-neon-cyan uppercase">{title}</h3>
      {children}
    </div>
  );
}

const notSet = <span className="text-fg-muted">Not set</span>;

export function ProfileDetailsSummary({
  profile,
  options,
}: {
  profile: MyMechanicProfile;
  options: Pick<MechanicFormOptions, "zipCentroids" | "zipSuggestions">;
}) {
  const garage = profile.private.garageAddress;
  return (
    <div className="space-y-8">
      <Group title="Public profile">
        <DescriptionList
          items={[
            { term: "Display name", description: profile.displayName },
            { term: "Experience", description: `${profile.yearsExperience} ${profile.yearsExperience === 1 ? "year" : "years"}` },
            { term: "Certifications", description: profile.certifications ?? notSet },
            {
              term: "Bio",
              description: profile.bio ? <span className="whitespace-pre-line">{profile.bio}</span> : notSet,
            },
          ]}
        />
      </Group>
      <Group title="Private contact details">
        <DescriptionList
          items={[
            { term: "Legal name", description: profile.private.legalName ?? notSet },
            { term: "Business name", description: profile.private.businessName ?? notSet },
            { term: "Phone", description: profile.private.phone ?? notSet },
            { term: "Contact email", description: profile.private.contactEmail ?? notSet },
          ]}
        />
      </Group>
      <Group title="Where you work">
        <DescriptionList
          items={[
            { term: "Base ZIP", description: `${profile.baseZip} · ${profile.baseArea.label}` },
            { term: "How you work", description: profile.serviceModeLabel },
            { term: "Travel radius", description: `${profile.travelRadiusMiles} miles for mobile jobs` },
            {
              term: "Garage address",
              description: garage ? `${garage.line1}, ${garage.city}, ${garage.state} ${garage.zip}` : notSet,
            },
          ]}
        />
        <ServiceAreaMap
          zip={profile.baseZip}
          radius={String(profile.travelRadiusMiles)}
          mode={profile.serviceMode}
          centroids={options.zipCentroids}
          pilotZips={options.zipSuggestions.map((suggestion) => suggestion.zip)}
        />
      </Group>
      <Group title="Insurance">
        <DescriptionList
          items={[
            { term: "Provider", description: profile.insurance.provider ?? notSet },
            { term: "Policy number", description: profile.insurance.policyNumber ?? notSet },
            {
              term: "Expires",
              description: profile.insurance.expiresOn ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {formatDate(profile.insurance.expiresOn)}
                  {profile.insurance.warning ? (
                    <Badge tone={profile.insurance.warning.kind === "expiring_soon" ? "warning" : "danger"}>
                      {profile.insurance.warning.kind === "expiring_soon" ? "Expires soon" : "Expired"}
                    </Badge>
                  ) : null}
                </span>
              ) : (
                notSet
              ),
            },
          ]}
        />
      </Group>
    </div>
  );
}

export function ServicesSummary({ profile }: { profile: MyMechanicProfile }) {
  return (
    <div className="space-y-6">
      <Group title="Services">
        {profile.services.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {profile.services.map((service) => (
              <li
                key={service.categoryId}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3 py-1 text-sm text-fg"
              >
                {service.safety === "approved" ? (
                  <ShieldCheck aria-hidden="true" className="size-4 text-success-700" />
                ) : service.safety === "pending_review" ? (
                  <ShieldAlert aria-hidden="true" className="size-4 text-warning-700" />
                ) : null}
                {service.name}
                {service.safetyLabel ? <span className="sr-only"> ({service.safetyLabel})</span> : null}
                {service.categoryEnabled ? null : <span className="text-fg-muted">(paused in the pilot)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No services yet.</p>
        )}
      </Group>
      <Group title="Makes">
        <p className="text-sm text-fg">
          {profile.servicesAllMakes ? "All makes" : profile.makes.length > 0 ? profile.makes.join(", ") : "None chosen"}
        </p>
      </Group>
    </div>
  );
}

export function AvailabilitySummary({ profile }: { profile: MyMechanicProfile }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {order.map((weekday) => {
          const windows = profile.availability.filter((window) => window.weekday === weekday);
          return (
            <li key={weekday} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="font-medium text-fg">{WEEKDAYS[weekday].label}</span>
              <span className={windows.length > 0 ? "text-fg" : "text-fg-muted"}>
                {windows.length > 0 ? windows.map((window) => formatTimeRange(window)).join(", ") : "Unavailable"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-fg-muted">Times are local to your base area ({profile.baseArea.label}).</p>
    </div>
  );
}

export function DocumentsSummary({ profile }: { profile: MyMechanicProfile }) {
  if (profile.documents.length === 0) {
    return <p className="text-sm text-fg-muted">No documents yet. Upload your photo ID and insurance certificate.</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {profile.documents.map((document) => {
        const isPdf = document.mimeType === "application/pdf";
        return (
          <li key={document.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted [&_svg]:size-4.5"
              >
                {isPdf ? <FileText /> : <ImageIcon />}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-fg">{document.kindLabel}</p>
                  <Badge tone={document.statusTone}>{document.statusLabel}</Badge>
                </div>
                <p className="text-xs text-fg-muted">
                  Uploaded {formatDate(document.uploadedAt, profile.baseArea.timeZone)} · {formatBytes(document.sizeBytes)}
                  {document.expiresOn ? ` · Expires ${formatDate(document.expiresOn)}` : null}
                </p>
                {document.reviewNote ? (
                  <p className="text-sm text-fg-muted">
                    <span className="font-medium">Admin note:</span> {document.reviewNote}
                  </p>
                ) : null}
              </div>
            </div>
            <a
              href={`/api/files/${document.fileId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-brand-800 underline-offset-2 hover:underline sm:min-h-9 sm:self-center"
            >
              {isPdf ? <Download aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
              {isPdf ? "Download" : "View"}
              <span className="sr-only"> {document.kindLabel}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
