import { ArrowRight, FileText, MapPin, Search, ShieldAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

import { GlowCard } from "@/components/motion/glow-card";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { MECHANIC_STATUS_INFO, MECHANIC_STATUSES } from "@/lib/domain";
import { pluralize } from "@/lib/format";
import { mechanicListQuerySchema, SEARCH_QUERY_MAX_LENGTH, type MechanicListFilter } from "@/lib/validation/admin";
import { listMechanics, type AdminMechanicListItem } from "@/server/admin/mechanics";

import { InsuranceBadge, MechanicStatusBadge, NeonChip } from "../_components/badges";
import { ClientAvatar } from "../_components/client-avatar";
import { ConsoleEmpty, ConsoleHeader } from "../_components/console";
import { Timestamp } from "../_components/timestamp";
import { mechanicModeLabel, withQuery } from "../_lib/display";
import { adminPage } from "../_lib/page-context";
import { TAP_TARGET } from "../_lib/ui";
import { inviteMechanicAction } from "./actions";
import { InviteMechanicDialog } from "./_components/invite-dialog";
import { AdminTabs } from "../_components/touch";

export const metadata: Metadata = { title: "Mechanics" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type TabKey = MechanicListFilter | "all";

const TAB_ORDER: readonly TabKey[] = ["awaiting_review", "all", ...MECHANIC_STATUSES];

function tabLabel(key: TabKey): string {
  if (key === "all") return "All";
  if (key === "awaiting_review") return "Awaiting review";
  return MECHANIC_STATUS_INFO[key].label;
}

function matchesTab(mechanic: AdminMechanicListItem, key: TabKey): boolean {
  if (key === "all") return true;
  if (key === "awaiting_review") return mechanic.status === "applied" || mechanic.status === "under_review";
  return mechanic.status === key;
}

function Fact({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span aria-hidden="true" className="mt-0.5 text-fg-subtle [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{term}</dt>
        <dd className="text-sm text-fg">{children}</dd>
      </div>
    </div>
  );
}

function MechanicRow({ mechanic, timeZone }: { mechanic: AdminMechanicListItem; timeZone: string }) {
  const href = `/admin/mechanics/${mechanic.id}`;
  const needsReview = mechanic.status === "applied" || mechanic.status === "under_review";
  return (
    <GlowCard
      as="li"
      glow={needsReview ? "violet" : "cyan"}
      className="glass-lite card-hover relative rounded-2xl p-4 sm:p-5"
    >
      <span
        aria-hidden="true"
        className={
          needsReview
            ? "pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-violet/70 to-transparent"
            : "pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent"
        }
      />
      <div className="flex gap-4">
        <div className="relative hidden shrink-0 sm:block">
          <ClientAvatar
            name={mechanic.displayName}
            src={mechanic.profilePhotoFileId ? `/api/files/${mechanic.profilePhotoFileId}` : null}
            size="lg"
          />
          {needsReview ? (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex size-3">
              <span className="absolute inset-0 animate-ping rounded-full bg-neon-violet opacity-70" />
              <span className="relative size-3 rounded-full bg-neon-violet ring-2 ring-canvas" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold text-fg">
                <Link
                  href={href}
                  className="-my-2 py-2 underline-offset-4 transition-colors hover:text-neon-cyan hover:underline"
                >
                  {mechanic.displayName}
                </Link>
                <MechanicStatusBadge status={mechanic.status} />
              </h2>
              <p className="font-mono text-xs wrap-anywhere text-fg-subtle">{mechanic.accountEmail}</p>
            </div>
            <div className="hidden shrink-0 sm:block">
              <ButtonLink
                href={href}
                size="sm"
                className={TAP_TARGET}
                variant={needsReview ? "primary" : "secondary"}
                trailingIcon={<ArrowRight />}
                aria-label={`${needsReview ? "Review" : "Open"} ${mechanic.displayName}`}
              >
                {needsReview ? "Review" : "Open"}
              </ButtonLink>
            </div>
          </div>

          {mechanic.statusReason && (mechanic.status === "rejected" || mechanic.status === "suspended") ? (
            <p className="rounded-xl border-l-2 border-danger-400/60 bg-fg/[0.03] px-3 py-2 text-sm text-fg-muted">
              <span className="font-medium text-fg">Reason:</span> {mechanic.statusReason}
            </p>
          ) : null}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-4">
            <Fact icon={<MapPin />} term="Base area">
              {mechanic.baseArea}
            </Fact>
            <Fact icon={<Wrench />} term="Service mode">
              {mechanicModeLabel(mechanic.serviceMode)}
              {mechanic.serviceMode !== "garage" ? `, ${mechanic.travelRadiusMiles} mi radius` : ""}
            </Fact>
            <Fact icon={<FileText />} term="Services & documents">
              <span className="flex flex-wrap items-center gap-1.5">
                {pluralize(mechanic.servicesCount, "service")} · {pluralize(mechanic.documentsCount, "document")}
                {mechanic.pendingDocumentsCount > 0 ? (
                  <NeonChip tone="warning" pulse>
                    {mechanic.pendingDocumentsCount} to review
                  </NeonChip>
                ) : null}
                {mechanic.safetyApprovalsPending > 0 ? (
                  <NeonChip tone="warning" icon={<ShieldAlert />}>
                    {pluralize(mechanic.safetyApprovalsPending, "safety approval")} pending
                  </NeonChip>
                ) : null}
              </span>
            </Fact>
            <Fact icon={<ShieldAlert />} term="Insurance">
              <InsuranceBadge insurance={mechanic.insurance} />
            </Fact>
          </dl>

          <div className="flex flex-col gap-3 border-t border-line pt-3 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
            <p>
              {mechanic.submittedAt ? (
                <>
                  Application submitted <Timestamp iso={mechanic.submittedAt} timeZone={timeZone} format="date" />
                </>
              ) : (
                "Application not submitted yet"
              )}
              {mechanic.statusChangedAt ? (
                <>
                  {" · "}status changed <Timestamp iso={mechanic.statusChangedAt} timeZone={timeZone} format="date" />
                </>
              ) : null}
              {!mechanic.acceptingJobs && mechanic.status === "approved" ? " · paused new jobs" : ""}
            </p>
            <div className="sm:hidden">
              <ButtonLink
                href={href}
                size="sm"
                fullWidth
                className={TAP_TARGET}
                variant={needsReview ? "primary" : "secondary"}
                trailingIcon={<ArrowRight />}
                aria-label={`${needsReview ? "Review" : "Open"} ${mechanic.displayName}`}
              >
                {needsReview ? "Review application" : "Open profile"}
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

export default async function MechanicsPage({ searchParams }: PageProps) {
  const { viewer, ctx, shell } = await adminPage("/admin/mechanics");
  const filters = mechanicListQuerySchema.parse(await searchParams);
  const current: TabKey = filters.status ?? "all";
  // One query for every status (with the search applied); tabs count and filter it.
  const everyone = await listMechanics(ctx, viewer, { query: filters.query });
  const shown = everyone.filter((mechanic) => matchesTab(mechanic, current));
  const waiting = everyone.filter((mechanic) => matchesTab(mechanic, "awaiting_review")).length;
  const tabHref = (key: TabKey) =>
    withQuery("/admin/mechanics", { status: key === "all" ? undefined : key, query: filters.query });

  return (
    <div className="space-y-6">
      <ConsoleHeader
        eyebrow="Admin / Mechanics"
        title="Mechanics"
        description="Applications and mechanic accounts. Check documents, insurance and safety-sensitive services before approving; every decision is recorded in the audit log."
        meta={
          waiting > 0 ? (
            <NeonChip tone="violet" pulse>
              {pluralize(waiting, "application")} awaiting review
            </NeonChip>
          ) : (
            <NeonChip tone="success">Review queue clear</NeonChip>
          )
        }
        actions={<InviteMechanicDialog action={inviteMechanicAction} />}
      />

      <Form
        action="/admin/mechanics"
        role="search"
        aria-label="Search mechanics"
        className="glass-lite rounded-2xl p-4"
      >
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
        <label htmlFor="mechanic-search" className="block text-sm font-medium text-fg">
          Search by name or account email
        </label>
        <div className="mt-1.5 flex items-stretch gap-2">
          <Input
            id="mechanic-search"
            name="query"
            type="search"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            defaultValue={filters.query ?? ""}
            placeholder="e.g. Alex or garage@example.com"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" leadingIcon={<Search />} className={TAP_TARGET}>
            <span className="max-sm:sr-only">Search</span>
          </Button>
          {filters.query ? (
            <ButtonLink
              href={withQuery("/admin/mechanics", { status: current === "all" ? undefined : current })}
              variant="ghost"
              replace
              className={TAP_TARGET}
            >
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </Form>

      <AdminTabs
        label="Mechanic status"
        current={current}
        items={TAB_ORDER.map((key) => ({
          key,
          href: tabHref(key),
          label: tabLabel(key),
          count: everyone.filter((mechanic) => matchesTab(mechanic, key)).length,
        }))}
      />

      {filters.query ? (
        <p className="font-mono text-xs text-fg-subtle" role="status">
          {pluralize(shown.length, "mechanic")} matching &ldquo;{filters.query}&rdquo;
          {current === "all" ? "" : ` in ${tabLabel(current).toLowerCase()}`}.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul aria-label={`${tabLabel(current)} mechanics`} className="stagger-children space-y-4">
          {shown.map((mechanic) => (
            <MechanicRow key={mechanic.id} mechanic={mechanic} timeZone={shell.reportingTimeZone} />
          ))}
        </ul>
      ) : (
        <ConsoleEmpty
          illustration={filters.query ? "no-results" : current === "awaiting_review" ? "success" : "no-jobs"}
          title={filters.query ? "No mechanics match your search" : `No ${tabLabel(current).toLowerCase()} mechanics`}
          action={
            filters.query || current !== "all" ? (
              <ButtonLink href="/admin/mechanics" variant="secondary" className={TAP_TARGET}>
                Show all mechanics
              </ButtonLink>
            ) : undefined
          }
        >
          {current === "awaiting_review"
            ? "Every application has been reviewed. New applications appear here, and admins are notified when one arrives."
            : "Try another tab or search. Invite a mechanic to grow supply in the pilot area."}
        </ConsoleEmpty>
      )}
    </div>
  );
}
