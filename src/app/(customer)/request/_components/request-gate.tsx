import { ArrowRight, ClipboardList, Lock, LogIn, MapPin, Receipt, UserPlus, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { SlideUp } from "@/components/motion/entrance";
import { Stagger } from "@/components/motion/stagger";
import { ButtonLink } from "@/components/ui/button-link";
import { pluralize } from "@/lib/format";
import type { PilotArea } from "@/server/catalog/pilot-zips";
import { homePathFor, loginPath, signupPath } from "@/server/auth/redirects";
import type { Viewer } from "@/server/context";

// What /request shows to people who can't send a request: signed-out visitors (who are
// invited to create an account or log in and come straight back) and mechanic or admin
// accounts (who are told why, and where to go instead).

const REQUEST_PATH = "/request";

const STEPS: ReadonlyArray<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <ClipboardList />,
    title: "Describe the problem",
    body: "Your car, what's wrong, and a few photos. It takes about three minutes.",
  },
  {
    icon: <Receipt />,
    title: "Get itemized quotes",
    body: "Approved mechanics near you send quotes with labor, parts and taxes listed separately.",
  },
  {
    icon: <Lock />,
    title: "Stay in control",
    body: "Your phone, email and address stay private until a booking is confirmed.",
  },
];

function GateIcon() {
  return (
    <span
      aria-hidden="true"
      className="relative mx-auto grid size-16 place-items-center rounded-2xl border border-brand-300/50 bg-linear-to-br from-brand-200 to-brand-50 text-brand-900 shadow-glow"
    >
      <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-neon-cyan/60" />
      <Wrench className="size-8" />
    </span>
  );
}

export function SignedOutRequestPanel({
  pilotAreas,
  sampleLogins,
}: {
  pilotAreas: readonly PilotArea[];
  /** Whether the log in page offers one-click sample accounts on this host. */
  sampleLogins: boolean;
}) {
  const zipCount = pilotAreas.reduce((sum, area) => sum + area.zips.length, 0);
  return (
    <PageContainer size="narrow">
      <SlideUp className="glass-strong glow-border overflow-hidden rounded-3xl">
        <div className="aurora relative px-6 py-12 text-center sm:px-10">
          <GateIcon />
          <p className="mt-6 font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">Request a repair</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
            Create a free account or log in to <span className="holo-text">request quotes</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-fg-muted">
            An account lets you follow your request, compare quotes as they arrive and keep your contact details
            private. You&rsquo;ll come straight back to the request form afterwards.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href={signupPath({ role: "customer", next: REQUEST_PATH })}
              size="lg"
              leadingIcon={<UserPlus />}
            >
              Create a free account
            </ButtonLink>
            <ButtonLink href={loginPath(REQUEST_PATH)} size="lg" variant="secondary" leadingIcon={<LogIn />}>
              Log in
            </ButtonLink>
          </div>
        </div>
        <Stagger as="ol" className="grid gap-6 border-t border-line px-6 py-8 sm:grid-cols-3 sm:px-10">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-xl border border-brand-300/40 bg-brand-50 text-brand-800 shadow-glow-sm [&_svg]:size-5"
              >
                {step.icon}
              </span>
              <h2 className="mt-3 font-semibold text-fg">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h2>
              <p className="mt-1 text-sm text-pretty text-fg-muted">{step.body}</p>
            </li>
          ))}
        </Stagger>
        {pilotAreas.length > 0 ? (
          <div className="flex items-start gap-3 border-t border-line bg-surface-2/50 px-6 py-4 text-sm text-fg-muted sm:px-10">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-cyan" />
            <p>
              We currently serve the {pilotAreas.map((area) => area.metroLabel).join(", ")} ({pluralize(zipCount, "ZIP code")}).
              Online payments are coming soon, so nothing is charged.
            </p>
          </div>
        ) : null}
      </SlideUp>
      {sampleLogins ? (
        <p className="mt-6 text-center text-sm text-fg-muted">
          Want a quick look first? The login page has one-click sample accounts, such as the customer &ldquo;Dana&rdquo;.
        </p>
      ) : null}
    </PageContainer>
  );
}

const ROLE_COPY = {
  mechanic: {
    title: "Repair requests come from customer accounts",
    body: "Mechanics don't send requests: you receive the ones matched to your services and area on your job board, and quote from there.",
    action: "Go to your job board",
  },
  admin: {
    title: "Admins don't send repair requests",
    body: "Requests come from customer accounts. You can see every request, its matching results and its quotes from the admin dashboard.",
    action: "Go to the admin dashboard",
  },
} as const;

export function WrongRoleRequestPanel({ viewer }: { viewer: Viewer & { role: "mechanic" | "admin" } }) {
  const copy = ROLE_COPY[viewer.role];
  return (
    <PageContainer size="narrow" padY={false} className="py-16 text-center sm:py-24">
      <SlideUp>
        <GateIcon />
        <p className="mt-6 font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">Request a repair</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-fg">{copy.title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-pretty text-fg-muted">{copy.body}</p>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-fg-muted">
          You&rsquo;re logged in as <strong className="font-semibold text-fg">{viewer.displayName}</strong>. To try the
          customer side, log in with a customer account instead.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={homePathFor(viewer.role)} trailingIcon={<ArrowRight />}>
            {copy.action}
          </ButtonLink>
          <ButtonLink href={loginPath(REQUEST_PATH)} variant="secondary" leadingIcon={<LogIn />}>
            Log in as a customer
          </ButtonLink>
        </div>
      </SlideUp>
    </PageContainer>
  );
}
