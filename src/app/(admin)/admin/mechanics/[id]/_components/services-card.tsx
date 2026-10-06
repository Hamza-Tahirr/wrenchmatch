import { CalendarClock, ShieldCheck, ShieldOff, Wrench } from "lucide-react";

import { ADMIN_REASON_MAX_LENGTH } from "@/lib/validation/admin";
import type { AdminMechanicDetail, AdminMechanicService } from "@/server/admin/mechanics";

import { ActionDialog, type AdminFormAction } from "../../../_components/action-dialog";
import { NeonChip } from "../../../_components/badges";
import { Panel } from "../../../_components/console";
import { Timestamp } from "../../../_components/timestamp";

function SafetyControl({
  mechanicId,
  mechanicName,
  service,
  timeZone,
  action,
}: {
  mechanicId: string;
  mechanicName: string;
  service: AdminMechanicService;
  timeZone: string;
  action: AdminFormAction;
}) {
  const work = service.name.toLowerCase();
  if (service.safetyApproved) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-success-700">
          <ShieldCheck aria-hidden="true" className="mr-1 inline size-4 align-[-3px]" />
          Approved for safety-sensitive work
          {service.safetyApprovedBy ? ` by ${service.safetyApprovedBy.displayName}` : ""}
          {service.safetyApprovedAt ? (
            <>
              {" "}
              on <Timestamp iso={service.safetyApprovedAt} timeZone={timeZone} format="date" />
            </>
          ) : null}
        </p>
        <ActionDialog
          trigger={
            <>
              Remove approval<span className="sr-only"> for {work}</span>
            </>
          }
          triggerIcon={<ShieldOff />}
          triggerVariant="secondary"
          title={`Remove ${mechanicName}'s approval for ${work}?`}
          description={`Matching stops sending ${work} requests to them. Quotes they already sent are not changed.`}
          action={action}
          hiddenFields={{ mechanicId, categoryId: service.categoryId, approved: "false" }}
          fields={[{ name: "reason", label: "Reason", optional: true, maxLength: ADMIN_REASON_MAX_LENGTH, hint: "Kept in the audit log." }]}
          confirmLabel="Remove approval"
          pendingLabel="Removing…"
          tone="danger"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-warning-700">Not approved yet: {mechanicName} receives no {work} requests.</p>
      <ActionDialog
        trigger={
          <>
            Approve<span className="sr-only"> {work}</span>
          </>
        }
        triggerIcon={<ShieldCheck />}
        triggerVariant="primary"
        title={`Approve ${mechanicName} for ${work}?`}
        description={`${service.name} is safety-sensitive. Approve only after checking their experience, certification and insurance for this work.`}
        action={action}
        hiddenFields={{ mechanicId, categoryId: service.categoryId, approved: "true" }}
        fields={[
          {
            name: "reason",
            label: "What did you check?",
            optional: true,
            maxLength: ADMIN_REASON_MAX_LENGTH,
            hint: "For example: ASE brake certification verified. Kept in the audit log.",
          },
        ]}
        confirmLabel="Approve safety-sensitive work"
        pendingLabel="Approving…"
      />
    </div>
  );
}

/** Services offered (with safety approvals for brakes and suspension), makes and weekly hours. */
export function ServicesCard({
  mechanic,
  timeZone,
  action,
}: {
  mechanic: AdminMechanicDetail;
  timeZone: string;
  action: AdminFormAction;
}) {
  const name = mechanic.profile.displayName;
  const safety = mechanic.services.filter((service) => service.safetySensitive);
  const other = mechanic.services.filter((service) => !service.safetySensitive);
  return (
    <Panel
      title="Services and makes"
      icon={<Wrench />}
      description="Brake and suspension work are safety-sensitive: matching sends them only to mechanics an admin approved for that work."
    >
      <div className="space-y-6">
        {safety.length > 0 ? (
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold tracking-tight text-fg">Safety-sensitive services</h3>
            <ul className="space-y-3">
              {safety.map((service) => (
                <li
                  key={service.categoryId}
                  className={
                    service.safetyApproved
                      ? "space-y-2 rounded-2xl border border-success-300/40 bg-success-50/30 p-3.5 sm:p-4"
                      : "space-y-2 rounded-2xl border border-warning-300/40 bg-warning-50/30 p-3.5 sm:p-4"
                  }
                >
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {service.name}
                    <NeonChip tone="warning">Safety-sensitive</NeonChip>
                    {!service.categoryEnabled ? <NeonChip tone="neutral">Category disabled</NeonChip> : null}
                  </p>
                  <SafetyControl mechanicId={mechanic.id} mechanicName={name} service={service} timeZone={timeZone} action={action} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="font-display text-sm font-semibold tracking-tight text-fg">
            {safety.length > 0 ? "Other services" : "Services"} <span className="font-mono text-xs text-fg-subtle">({other.length})</span>
          </h3>
          {other.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {other.map((service) => (
                <li key={service.categoryId}>
                  <NeonChip tone={service.categoryEnabled ? "info" : "warning"}>
                    {service.name}
                    {service.categoryEnabled ? "" : " (category disabled)"}
                  </NeonChip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">
              {mechanic.services.length === 0 ? "No services chosen yet." : "Only safety-sensitive services."}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-sm font-semibold tracking-tight text-fg">Makes serviced</h3>
          {mechanic.profile.servicesAllMakes ? (
            <NeonChip tone="success">All makes</NeonChip>
          ) : mechanic.makes.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {mechanic.makes.map((make) => (
                <li key={make}>
                  <NeonChip tone="neutral">{make}</NeonChip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">No makes chosen yet: matching skips every request.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-fg">
            <CalendarClock aria-hidden="true" className="size-4 text-neon-cyan" />
            Weekly availability <span className="font-sans text-xs font-normal text-fg-subtle">({mechanic.profile.timeZone} local time)</span>
          </h3>
          {mechanic.availability.length > 0 ? (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {mechanic.availability.map((window) => (
                <li key={`${window.weekday}-${window.startMinute}`} className="flex justify-between gap-3 border-b border-line py-1.5">
                  <span className="text-fg-muted">{window.weekdayLabel}</span>
                  <span className="font-mono text-xs text-fg tabular">{window.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">No weekly hours set: matching finds no availability.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
