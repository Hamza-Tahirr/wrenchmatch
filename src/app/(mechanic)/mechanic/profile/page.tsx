import { CalendarClock, FileText, Images, UserRound, Upload, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Success, UploadPhotos } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { MechanicGalleryStrip } from "@/components/media/mechanic-gallery-strip";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastOnMount } from "@/components/ui/toast";
import { pluralize } from "@/lib/format";
import { addDaysToDate, todayInZone } from "@/lib/time";
import { requireRole } from "@/server/auth/viewer";
import { createAppContext } from "@/server/context";
import { getMyGalleryOverview } from "@/server/media/gallery";
import { getAccountDeletionRequest } from "@/server/mechanic/account-deletion";
import { getMechanicFormOptions } from "@/server/mechanic/form-options";
import { getMyMechanicProfile } from "@/server/mechanic/profile";

import { HudLabel, LiveDot, MechanicHero, Panel } from "../_components/hud";
import { EditableSection } from "./_components/editable-section";
import { AvailabilityForm, ProfileDetailsForm, ServicesForm } from "./_components/profile-forms";
import { AcceptingJobsCard, AccountCard, ChecklistCard, PayoutOnboardingCard, PhotoCard, SafetyCard } from "./_components/side-cards";
import { InsuranceWarning, StatusPanel } from "./_components/status-panel";
import { AvailabilitySummary, DocumentsSummary, ProfileDetailsSummary, ServicesSummary } from "./_components/summaries";
import { DocumentUploadForm } from "./_components/upload-forms";

export const metadata: Metadata = { title: "Mechanic profile" };

const EDITABLE = ["details", "services", "availability", "documents"] as const;
type Editable = (typeof EDITABLE)[number];

type ProfilePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MechanicProfilePage({ searchParams }: ProfilePageProps) {
  const viewer = await requireRole("mechanic", "/mechanic/profile");
  const query = await searchParams;
  const ctx = createAppContext();
  const profile = await getMyMechanicProfile(ctx, viewer);
  if (!profile) redirect("/mechanic/apply");
  const [options, gallery, deletion] = await Promise.all([
    getMechanicFormOptions(ctx),
    getMyGalleryOverview(ctx, viewer),
    getAccountDeletionRequest(ctx, viewer),
  ]);

  const editParam = firstValue(query.edit);
  const editing: Editable | null = EDITABLE.find((section) => section === editParam) ?? null;
  const submitted = firstValue(query.submitted) === "1";
  const minInsuranceExpiry = addDaysToDate(todayInZone(ctx.now, profile.baseArea.timeZone), 1);
  const enabledIds = new Set(options.categories.map((category) => category.id));
  const pausedServices = profile.services
    .filter((service) => !enabledIds.has(service.categoryId))
    .map((service) => ({ id: service.categoryId, name: service.name }));
  const pendingDocuments = profile.documents.filter((document) => document.status === "pending").length;
  // Remount a section when "?edit=" changes so a link can open it from the same page.
  const sectionKey = (section: Editable) => (editing === section ? `${section}-editing` : section);
  const receiving = profile.status === "approved" && profile.acceptingJobs && profile.eligibility.canReceiveJobs;

  return (
    <PageContainer size="wide">
      <MechanicHero
        eyebrow="Mechanic profile"
        title={profile.displayName}
        meta={
          <>
            <Badge tone={profile.statusTone}>{profile.statusLabel}</Badge>
            {profile.status === "approved" ? (
              <span
                className={
                  receiving
                    ? "inline-flex items-center gap-2 rounded-full border border-success-600/40 bg-success-600/10 px-2.5 py-0.5 text-xs font-medium text-success-700"
                    : "inline-flex items-center gap-2 rounded-full border border-warning-600/40 bg-warning-600/10 px-2.5 py-0.5 text-xs font-medium text-warning-700"
                }
              >
                <LiveDot tone={receiving ? "success" : "warning"} className="size-2" />
                {!profile.acceptingJobs ? "Jobs paused" : receiving ? "Accepting jobs" : "Not receiving jobs"}
              </span>
            ) : null}
          </>
        }
        description={`${profile.serviceModeLabel} · ${profile.baseArea.label} · ${pluralize(profile.yearsExperience, "year")} of experience`}
        actions={
          <ButtonLink href="/mechanic/gallery" variant="secondary" leadingIcon={<Images />}>
            Work gallery
          </ButtonLink>
        }
        art={
          <div className="relative grid size-44 place-items-center">
            <span className="absolute inset-0 rounded-full border border-dashed border-neon-cyan/40 motion-safe:animate-spin-slow" />
            <span className="absolute inset-4 rounded-full border border-neon-violet/40" />
            <span className="absolute inset-0 rounded-full bg-neon-cyan/10 blur-2xl" />
            <span className="relative rounded-full p-1 ring-2 ring-neon-cyan/60 shadow-glow">
              <Avatar
                name={profile.displayName}
                src={profile.profilePhotoFileId ? `/api/files/${profile.profilePhotoFileId}` : null}
                size="lg"
              />
            </span>
          </div>
        }
      />

      <div className="mt-6 space-y-4">
        {submitted ? (
          <section aria-labelledby="submitted-title" className="glass glow-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
            <ToastOnMount title="Application submitted" description="An admin will review your details and documents." />
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <Success decorative className="w-36 shrink-0" />
              <div role="status" className="space-y-2">
                <HudLabel>Application received</HudLabel>
                <h2 id="submitted-title" className="font-display text-2xl font-semibold tracking-tight text-fg">
                  Application submitted
                </h2>
                <p className="max-w-2xl text-sm text-fg-muted sm:text-base">
                  Thanks! An admin will review your details and documents. You&rsquo;ll get a notification when it&rsquo;s
                  decided, and you&rsquo;ll start receiving matched jobs after approval.
                </p>
              </div>
            </div>
          </section>
        ) : null}
        <StatusPanel profile={profile} />
        <InsuranceWarning profile={profile} />
      </div>

      {/* DOM order is the phone order: the quick controls (new jobs on/off, and the checklist
          while it is incomplete) first, then the sections, then the other cards. On wide
          screens both card groups share the right column. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8">
        <div className="animate-slide-up space-y-6 lg:col-start-2 lg:row-start-1">
          <AcceptingJobsCard profile={profile} />
          {profile.checklist.complete ? null : <ChecklistCard profile={profile} />}
        </div>

        <div className="stagger-children min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <EditableSection
            key={sectionKey("details")}
            id="profile-details"
            title="Profile, service area and insurance"
            description="Your public name and bio, private contact details, where you work and your insurance."
            icon={<UserRound />}
            defaultEditing={editing === "details"}
            summary={<ProfileDetailsSummary profile={profile} options={options} />}
          >
            <ProfileDetailsForm
              initialValues={profile.formValues.profile}
              options={options}
              minInsuranceExpiry={minInsuranceExpiry}
              insuranceLocked={profile.status === "under_review" || profile.status === "approved" || profile.status === "suspended"}
            />
          </EditableSection>

          <EditableSection
            key={sectionKey("services")}
            id="services"
            title="Services and makes"
            description="You're matched only to requests in these categories, for these makes."
            icon={<Wrench />}
            defaultEditing={editing === "services"}
            summary={<ServicesSummary profile={profile} />}
          >
            <ServicesForm initialValues={profile.formValues.services} options={options} extraCategories={pausedServices} />
          </EditableSection>

          <EditableSection
            key={sectionKey("availability")}
            id="availability"
            title="Weekly availability"
            description="Requests are matched when the customer's preferred time overlaps your hours."
            icon={<CalendarClock />}
            defaultEditing={editing === "availability"}
            summary={<AvailabilitySummary profile={profile} />}
          >
            <AvailabilityForm initialValues={profile.formValues.availability} />
          </EditableSection>

          <EditableSection
            key={sectionKey("documents")}
            id="documents"
            title="Documents"
            description="Photo ID, insurance certificate and certifications. Private to you and admins."
            icon={<FileText />}
            editLabel="Upload a document"
            editIcon={<Upload />}
            defaultEditing={editing === "documents"}
            badges={pendingDocuments > 0 ? <Badge tone="warning">{pluralize(pendingDocuments, "document")} in review</Badge> : null}
            summary={<DocumentsSummary profile={profile} />}
          >
            <DocumentUploadForm documentKinds={options.documentKinds} limits={options.uploads.document} />
          </EditableSection>

          <Panel
            id="work-gallery"
            title="Work gallery"
            eyebrow={`${gallery.photos.length} of ${gallery.limit} photos`}
            description="Photos of your work, shown to customers you quote for or are booked with."
            icon={<Images />}
            tone="violet"
            actions={
              <ButtonLink href="/mechanic/gallery" variant={gallery.photos.length > 0 ? "secondary" : "primary"} leadingIcon={<Images />}>
                {gallery.photos.length > 0 ? "Manage gallery" : "Add work photos"}
              </ButtonLink>
            }
          >
            {gallery.photos.length > 0 ? (
              <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
                <MechanicGalleryStrip mechanicId={profile.userId} layout="grid" title={null} />
              </Suspense>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center sm:flex-row sm:text-left">
                <UploadPhotos decorative className="w-32 shrink-0" />
                <p className="text-sm text-fg-muted">
                  Show customers what you do: brake jobs, clean engine bays, before and after shots. Pictures are
                  re-encoded with location data removed.
                </p>
              </div>
            )}
          </Panel>
        </div>

        <aside aria-label="Profile status" className="space-y-6 lg:col-start-2 lg:row-start-2">
          <PhotoCard profile={profile} limits={options.uploads.profilePhoto} />
          {profile.checklist.complete ? <ChecklistCard profile={profile} /> : null}
          <SafetyCard profile={profile} />
          <PayoutOnboardingCard profile={profile} />
          <AccountCard deletion={deletion} />
        </aside>
      </div>
    </PageContainer>
  );
}
