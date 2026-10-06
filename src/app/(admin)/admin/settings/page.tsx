import { CircleCheck, CirclePause, MapPinned, Plus, ShieldAlert, Tags } from "lucide-react";
import type { Metadata } from "next";

import { pluralize } from "@/lib/format";
import { ADMIN_REASON_MAX_LENGTH } from "@/lib/validation/admin";
import { listCategories, type AdminCategoryItem } from "@/server/admin/categories";
import { listPilotZips, type AdminPilotZipItem } from "@/server/admin/pilot-zips";

import { ActionDialog, type ActionDialogField } from "../_components/action-dialog";
import { NeonChip } from "../_components/badges";
import { ConsoleEmpty, ConsoleHeader, ConsoleNote, Panel, SectionHeading } from "../_components/console";
import { ConsoleTable } from "../_components/console-table";
import { HiddenHeader } from "../_components/hidden-header";
import { CoverageConsole } from "../_components/maps/coverage-console";
import { zipPointId } from "../_components/maps/ids";
import { StatusSwap } from "../_components/status-swap";
import { adminPage } from "../_lib/page-context";
import {
  lookupZipAction,
  savePilotZipAction,
  setCategoryEnabledAction,
  setPilotZipEnabledAction,
} from "./actions";
import { PilotZipForm } from "./_components/pilot-zip-form";

export const metadata: Metadata = { title: "Settings" };

const optionalReason: ActionDialogField = {
  name: "reason",
  label: "Reason",
  optional: true,
  maxLength: ADMIN_REASON_MAX_LENGTH,
  hint: "Kept in the audit log.",
};

function EnabledChip({ enabled }: { enabled: boolean }) {
  return (
    <StatusSwap status={enabled ? "enabled" : "disabled"}>
      {enabled ? (
        <NeonChip tone="success" pulse>
          Enabled
        </NeonChip>
      ) : (
        <NeonChip tone="neutral">Disabled</NeonChip>
      )}
    </StatusSwap>
  );
}

/** The same status as a compact line of text with a dot, for the phone rows. */
function EnabledText({ enabled }: { enabled: boolean }) {
  return (
    <StatusSwap status={enabled ? "enabled" : "disabled"}>
      <span className={enabled ? "inline-flex items-center gap-1.5 font-medium text-success-700" : "inline-flex items-center gap-1.5 font-medium text-fg-subtle"}>
        <span
          aria-hidden="true"
          className={enabled ? "size-1.5 rounded-full bg-success-500 shadow-[0_0_8px_var(--color-success-500)]" : "size-1.5 rounded-full border border-fg-subtle"}
        />
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </StatusSwap>
  );
}

function CategoryToggle({ category }: { category: AdminCategoryItem }) {
  const label = category.name;
  if (category.enabled) {
    return (
      <ActionDialog
        trigger={
          <>
            Disable<span className="sr-only"> {label}</span>
          </>
        }
        triggerIcon={<CirclePause />}
        triggerVariant="secondary"
        title={`Disable ${label}?`}
        description="It disappears from the request form, so customers can't choose it for new requests, and matching can't be re-run for it."
        action={setCategoryEnabledAction}
        hiddenFields={{ categoryId: category.id, enabled: "false" }}
        fields={[optionalReason]}
        confirmLabel="Disable category"
        pendingLabel="Disabling…"
        tone="danger"
      >
        {category.activeRequests > 0 ? (
          <ConsoleNote tone="warning">
            {pluralize(category.activeRequests, "request")} in this category {category.activeRequests === 1 ? "is" : "are"}{" "}
            waiting for quotes. They continue: mechanics already notified can still quote.
          </ConsoleNote>
        ) : null}
      </ActionDialog>
    );
  }
  return (
    <ActionDialog
      trigger={
        <>
          Enable<span className="sr-only"> {label}</span>
        </>
      }
      triggerIcon={<CircleCheck />}
      triggerVariant="primary"
      title={`Enable ${label}?`}
      description="Customers can choose it on the request form again, and new requests are matched as usual."
      action={setCategoryEnabledAction}
      hiddenFields={{ categoryId: category.id, enabled: "true" }}
      fields={[optionalReason]}
      confirmLabel="Enable category"
      pendingLabel="Enabling…"
    />
  );
}

function ZipToggle({ zip }: { zip: AdminPilotZipItem }) {
  const name = `ZIP ${zip.zip} (${zip.city})`;
  if (zip.enabled) {
    return (
      <ActionDialog
        trigger={
          <>
            Disable<span className="sr-only"> {name}</span>
          </>
        }
        triggerIcon={<CirclePause />}
        triggerVariant="secondary"
        title={`Disable ${name}?`}
        description="New requests from this ZIP are refused with a clear 'outside the pilot area' message, and matching can't be re-run there. Existing requests continue."
        action={setPilotZipEnabledAction}
        hiddenFields={{ zip: zip.zip, enabled: "false" }}
        fields={[optionalReason]}
        confirmLabel="Disable ZIP"
        pendingLabel="Disabling…"
        tone="danger"
      />
    );
  }
  return (
    <ActionDialog
      trigger={
        <>
          Enable<span className="sr-only"> {name}</span>
        </>
      }
      triggerIcon={<CircleCheck />}
      triggerVariant="primary"
      title={`Enable ${name}?`}
      description="Customers in this ZIP can send repair requests again."
      action={setPilotZipEnabledAction}
      hiddenFields={{ zip: zip.zip, enabled: "true" }}
      fields={[optionalReason]}
      confirmLabel="Enable ZIP"
      pendingLabel="Enabling…"
    />
  );
}

/** The value most items share (e.g. the usual metro label or centroid source). */
function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export default async function SettingsPage() {
  const { viewer, ctx } = await adminPage("/admin/settings");
  const [categories, zips] = await Promise.all([listCategories(ctx, viewer), listPilotZips(ctx, viewer)]);
  const metros = [...Map.groupBy(zips, (zip) => zip.metroLabel).entries()];
  const disabledCategories = categories.filter((category) => !category.enabled).length;
  const enabledZips = zips.filter((zip) => zip.enabled).length;
  const usualSource = mostCommon(zips.map((zip) => zip.centroidSource));

  return (
    <div className="space-y-8">
      <ConsoleHeader
        eyebrow="Admin / Settings"
        title="Settings"
        description="Service categories and the pilot area take effect immediately, without a deployment. Every change is recorded in the audit log."
        meta={
          <>
            <NeonChip tone="info">
              {categories.length - disabledCategories} of {categories.length} categories enabled
            </NeonChip>
            <NeonChip tone="success">
              {enabledZips} of {pluralize(zips.length, "pilot ZIP")} enabled
            </NeonChip>
          </>
        }
      />

      <section aria-labelledby="pilot-title" className="space-y-4">
        <SectionHeading
          id="pilot-title"
          count={zips.length}
          description={
            <>
              {enabledZips} of {pluralize(zips.length, "ZIP code")} enabled. Customers can only send requests from enabled pilot
              ZIPs. Add any US ZIP to pilot another area.
            </>
          }
        >
          Pilot area
        </SectionHeading>

        <CoverageConsole
          zips={zips.map((zip) => ({
            zip: zip.zip,
            city: zip.city,
            state: zip.state,
            metroLabel: zip.metroLabel,
            enabled: zip.enabled,
            lat: zip.lat,
            lng: zip.lng,
            activeRequests: zip.activeRequests,
            mechanicsBasedHere: zip.mechanicsBasedHere,
          }))}
          form={
            <Panel
              title="Add or update a pilot ZIP"
              icon={<Plus />}
              variant="glass"
              tone="violet"
              description="Type the ZIP first: we check whether its location is already on file and preview it on the map."
            >
              <PilotZipForm
                action={savePilotZipAction}
                lookup={lookupZipAction}
                defaultMetroLabel={mostCommon(zips.map((zip) => zip.metroLabel))}
              />
            </Panel>
          }
        >
          <div className="space-y-6">
            <ConsoleNote icon={<MapPinned />} title="Locations are approximate">
              Each ZIP has an approximate center point used for distances (no exact addresses and no paid geocoder). Requests
              copy the ZIP&rsquo;s time zone, so times show in local time. Hover or focus a row to find it on the map.
            </ConsoleNote>
            {metros.length === 0 ? (
              <ConsoleEmpty illustration="no-results" title="No pilot ZIPs yet">
                Add the first ZIP code above to open the pilot area.
              </ConsoleEmpty>
            ) : (
              metros.map(([metro, metroZips]) => (
                <Panel
                  key={metro}
                  title={metro}
                  titleAs="h3"
                  icon={<MapPinned />}
                  description={`${metroZips.filter((zip) => zip.enabled).length} of ${pluralize(metroZips.length, "ZIP")} enabled. Centers come from ${usualSource} unless marked otherwise.`}
                  bodyClassName="px-2 py-2 sm:px-3 sm:py-3"
                >
                  <ConsoleTable
                    caption={`${metro} pilot ZIP codes`}
                    captionHidden
                    mobile="scroll"
                    bare
                    rows={metroZips}
                    getRowKey={(zip) => zip.zip}
                    rowAttributes={(zip) => ({ "data-map-id": zipPointId(zip.zip) })}
                    mobileCard={(zip) => (
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="flex min-w-0 items-baseline gap-2">
                            <span className="font-mono font-semibold text-fg tabular">{zip.zip}</span>
                            <span className="truncate text-sm text-fg">
                              {zip.city}, {zip.state}
                            </span>
                          </p>
                          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                            <EnabledText enabled={zip.enabled} />
                            <span className="font-mono text-fg-subtle">
                              · {zip.activeRequests} waiting · {pluralize(zip.mechanicsBasedHere, "mechanic")}
                              {zip.centroidSource !== usualSource
                                ? ` · ${zip.centroidSource.startsWith("admin") ? "admin-entered center" : zip.centroidSource}`
                                : ""}
                            </span>
                          </p>
                        </div>
                        <ZipToggle zip={zip} />
                      </div>
                    )}
                    columns={[
                      {
                        key: "zip",
                        header: "ZIP",
                        primary: true,
                        cell: (zip) => <span className="font-mono font-semibold text-fg tabular">{zip.zip}</span>,
                      },
                      {
                        key: "area",
                        header: "City",
                        cell: (zip) => (
                          <span className="flex flex-col whitespace-nowrap">
                            <span className="text-fg">
                              {zip.city}, {zip.state}
                            </span>
                            <span className="text-xs text-fg-subtle">{zip.timeZone}</span>
                          </span>
                        ),
                      },
                      { key: "status", header: "Status", cell: (zip) => <EnabledChip enabled={zip.enabled} /> },
                      {
                        key: "location",
                        header: "Approximate center",
                        cell: (zip) => (
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
                            <span className="font-mono text-xs tabular">
                              {zip.lat.toFixed(3)}, {zip.lng.toFixed(3)}
                            </span>
                            {zip.centroidSource !== usualSource ? (
                              <span title={zip.centroidSource}>
                                <NeonChip tone="violet">{zip.centroidSource.startsWith("admin") ? "Admin-entered" : zip.centroidSource}</NeonChip>
                              </span>
                            ) : null}
                          </span>
                        ),
                      },
                      {
                        key: "activity",
                        header: "Activity",
                        cell: (zip) => (
                          <span className="font-mono text-xs whitespace-nowrap text-fg-muted">
                            {zip.activeRequests} waiting · {pluralize(zip.mechanicsBasedHere, "mechanic")}
                          </span>
                        ),
                      },
                      {
                        key: "toggle",
                        header: <HiddenHeader>Actions</HiddenHeader>,
                        align: "right",
                        cell: (zip) => <ZipToggle zip={zip} />,
                      },
                    ]}
                  />
                </Panel>
              ))
            )}
          </div>
        </CoverageConsole>
      </section>

      <Panel
        title="Service categories"
        icon={<Tags />}
        description={`${categories.length - disabledCategories} of ${categories.length} enabled. Disabling a category hides it from new requests; requests already submitted continue.`}
        bodyClassName="px-2 py-2 sm:px-3 sm:py-3"
      >
        <ConsoleTable
          caption="Service categories"
          captionHidden
          bare
          rows={categories}
          getRowKey={(category) => category.id}
          empty={<ConsoleEmpty bare illustration="no-results" title="No categories" />}
          mobileCard={(category) => (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-fg">{category.name}</p>
                  <p className="text-xs text-fg-subtle">{category.shortDescription}</p>
                </div>
                <EnabledChip enabled={category.enabled} />
              </div>
              {category.customerNotice ? (
                <p className="text-xs text-fg-subtle">Customer notice: {category.customerNotice}</p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {category.safetySensitive ? (
                    <NeonChip tone="warning" icon={<ShieldAlert />}>
                      Safety-sensitive
                    </NeonChip>
                  ) : null}
                  <NeonChip tone="neutral">
                    {category.approvedMechanicsOffering} offer it
                    {category.safetyApprovedMechanics !== null ? ` · ${category.safetyApprovedMechanics} safety-approved` : ""}
                  </NeonChip>
                  <NeonChip tone={category.activeRequests > 0 ? "info" : "neutral"}>{category.activeRequests} waiting</NeonChip>
                </div>
                <CategoryToggle category={category} />
              </div>
            </div>
          )}
          columns={[
            {
              key: "name",
              header: "Category",
              primary: true,
              className: "min-w-[16rem]",
              cell: (category) => (
                <span className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {category.name}
                    {category.safetySensitive ? (
                      <NeonChip tone="warning" icon={<ShieldAlert />}>
                        Safety-sensitive
                      </NeonChip>
                    ) : null}
                  </span>
                  <span className="text-xs font-normal text-fg-subtle">{category.shortDescription}</span>
                  {category.customerNotice ? (
                    <span className="text-xs font-normal text-fg-subtle">Customer notice: {category.customerNotice}</span>
                  ) : null}
                </span>
              ),
            },
            { key: "status", header: "Status", cell: (category) => <EnabledChip enabled={category.enabled} /> },
            {
              key: "supply",
              header: "Approved mechanics",
              cell: (category) => (
                <span className="flex flex-col">
                  <span className="font-mono text-xs tabular">{category.approvedMechanicsOffering} offer it</span>
                  {category.safetyApprovedMechanics !== null ? (
                    <span className="font-mono text-xs text-fg-subtle tabular">{category.safetyApprovedMechanics} safety-approved</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "demand",
              header: "Waiting for quotes",
              align: "right",
              cell: (category) => <span className="font-mono text-fg tabular">{category.activeRequests}</span>,
            },
            {
              key: "toggle",
              header: <HiddenHeader>Actions</HiddenHeader>,
              actions: true,
              align: "right",
              cell: (category) => <CategoryToggle category={category} />,
            },
          ]}
        />
      </Panel>
    </div>
  );
}
