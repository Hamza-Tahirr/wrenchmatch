import { BadgeCheck, Lock, Receipt } from "lucide-react";
import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { SlideUp } from "@/components/motion/entrance";
import { Callout } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { RECORD_ID_PATTERN } from "@/lib/validation/request";
import { getViewer } from "@/server/auth/viewer";
import { listPilotAreas } from "@/server/catalog/pilot-zips";
import { getRequestFormOptions } from "@/server/catalog/request-form";
import { createAppContext, type AppContext, type Viewer } from "@/server/context";
import { initialRequestFormState } from "@/server/customer/request-form";
import { getRequestFormDefaults, type RequestFormDefaults } from "@/server/customer/request-form-defaults";
import { isDomainError } from "@/server/errors";

import { RequestAside } from "./_components/request-aside";
import { RequestForm } from "./_components/request-form";
import { sampleLoginsAvailable } from "@/app/(public)/login/sample-logins";
import { SignedOutRequestPanel, WrongRoleRequestPanel } from "./_components/request-gate";

export const metadata: Metadata = {
  title: "Request a repair",
  description: "Describe what your car needs and get itemized quotes from approved local mechanics.",
};

const HIGHLIGHTS = [
  { icon: <BadgeCheck />, label: "Admin-approved mechanics" },
  { icon: <Receipt />, label: "Itemized quotes" },
  { icon: <Lock />, label: "Contact details private until booked" },
] as const;

type RequestPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The form's starting values; a "Request again" link for a request we can't find falls back to a fresh form. */
async function loadDefaults(
  ctx: AppContext,
  viewer: Viewer,
  fromRequestId: string | null,
): Promise<{ defaults: RequestFormDefaults; copyFailed: boolean }> {
  if (!fromRequestId) return { defaults: await getRequestFormDefaults(ctx, viewer), copyFailed: false };
  try {
    return { defaults: await getRequestFormDefaults(ctx, viewer, { fromRequestId }), copyFailed: false };
  } catch (error) {
    if (!isDomainError(error) || error.code !== "not_found") throw error;
    return { defaults: await getRequestFormDefaults(ctx, viewer), copyFailed: true };
  }
}

export default async function RequestPage({ searchParams }: RequestPageProps) {
  const viewer = await getViewer();
  const ctx = createAppContext();
  if (!viewer) {
    return <SignedOutRequestPanel pilotAreas={await listPilotAreas(ctx.db)} sampleLogins={await sampleLoginsAvailable()} />;
  }
  if (viewer.role !== "customer") return <WrongRoleRequestPanel viewer={{ ...viewer, role: viewer.role }} />;

  const from = firstValue((await searchParams).from)?.trim() ?? "";
  const fromRequestId = RECORD_ID_PATTERN.test(from) ? from : null;
  const options = await getRequestFormOptions(ctx);
  const { defaults, copyFailed } = await loadDefaults(ctx, viewer, fromRequestId);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Request a repair"
        title={
          <>
            Tell us what your car <span className="holo-text">needs</span>
          </>
        }
        description="Approved mechanics near you will send itemized quotes to compare. It takes about three minutes, and nothing is booked until you choose."
      />
      <ul aria-label="Why request here" className="mt-5 flex flex-wrap gap-2 stagger-children">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.label}
            className="glass-lite inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-fg-muted sm:text-sm"
          >
            <span aria-hidden="true" className="text-neon-cyan [&_svg]:size-4">
              {item.icon}
            </span>
            {item.label}
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-4 empty:hidden">
        {copyFailed ? (
          <Callout tone="warning" title="We couldn't find that request to copy">
            <p>It may belong to a different account. You can fill in the form below instead.</p>
          </Callout>
        ) : null}
        {defaults.source === "copied_request" ? (
          <Callout tone="info" title="We copied the details of your earlier request">
            <p>
              Check everything before you send it.
              {defaults.notCopied.includes("preferredDate") ? " The earlier preferred date has passed, so choose a new one." : ""}
              {defaults.notCopied.includes("categoryId")
                ? " The kind of repair you chose before isn't offered right now, so pick another."
                : ""}{" "}
              Photos and videos aren&rsquo;t copied, and the agreements need ticking again.
            </p>
          </Callout>
        ) : null}
        {defaults.source === "last_request" ? (
          <Callout tone="info" title="We filled in your details from your last request">
            <p>Your location and contact details are already in place. Change anything that&rsquo;s different this time.</p>
          </Callout>
        ) : null}
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SlideUp className="min-w-0">
          <RequestForm initialState={initialRequestFormState(defaults.values)} options={options} />
        </SlideUp>
        <SlideUp as="aside" delay={0.12} aria-label="About your request" className="hidden lg:sticky lg:top-24 lg:block">
          <RequestAside />
        </SlideUp>
      </div>
    </PageContainer>
  );
}
