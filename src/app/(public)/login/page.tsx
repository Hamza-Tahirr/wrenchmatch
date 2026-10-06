import type { Metadata } from "next";
import Link from "next/link";

import { roleLabels } from "@/components/layout/nav-items";
import { Alert, Callout } from "@/components/ui/alert";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from "@/server/auth/demo-accounts";
import { homePathFor, sanitizeNextPath, signupPath } from "@/server/auth/redirects";
import { getViewer } from "@/server/auth/viewer";
import { AuthShell } from "./_components/auth-shell";
import { LoginForm } from "./_components/login-form";
import type { SampleAccount, SampleLoginData, SampleTab, SampleTabId, SampleTone } from "./_components/sample-accounts";
import { sampleLoginsAvailable } from "./sample-logins";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to WrenchMatch to manage repair requests, quotes and jobs.",
};

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Presentation copy for the seeded sample accounts (chip + one line), by email. */
const SAMPLE_COPY: Record<string, { chip: string; tone: SampleTone; description: string }> = {
  "customer@example.com": { chip: "Customer", tone: "cyan", description: "Requests, quotes and reservations in progress." },
  "customer2@example.com": { chip: "Customer", tone: "cyan", description: "A second customer, to check that Dana's records stay private." },
  "mechanic@example.com": { chip: "Approved", tone: "emerald", description: "Mobile and garage service, with quotes and bookings." },
  "mechanic2@example.com": { chip: "Approved", tone: "emerald", description: "Mobile service only." },
  "garage@example.com": { chip: "Approved", tone: "emerald", description: "Garage only. Approved for brake and suspension work." },
  "jordan@example.com": { chip: "Approved", tone: "emerald", description: "Offers brake work but isn't approved for it." },
  "applicant@example.com": { chip: "In review", tone: "amber", description: "Application waiting for an admin's review." },
  "suspended@example.com": { chip: "Suspended", tone: "rose", description: "Suspended, so left out of matching." },
  "expired@example.com": { chip: "Insurance expired", tone: "amber", description: "Approved, but the insurance on record has expired." },
  "rejected@example.com": { chip: "Rejected", tone: "rose", description: "Application not approved." },
  "admin@example.com": { chip: "Admin", tone: "violet", description: "Applications, matching, settings, help desk and audit log." },
};

/** Presentation mode: never show "demo" wording, even in fallback copy. */
function withoutDemoWording(text: string): string {
  return text
    .replace(/\s*\(has demo documents\)/gi, "")
    .replace(/\bdemo\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toSample(account: DemoAccount): SampleAccount {
  const copy = SAMPLE_COPY[account.email];
  return {
    email: account.email,
    displayName: account.displayName,
    chip: copy?.chip ?? roleLabels[account.role],
    tone: copy?.tone ?? (account.role === "admin" ? "violet" : "cyan"),
    description: copy?.description ?? withoutDemoWording(account.summary),
  };
}

function sampleLoginData(next: string | null): SampleLoginData {
  const byGroup = (group: DemoAccount["group"]) => DEMO_ACCOUNTS.filter((account) => account.group === group).map(toSample);
  const tabs: SampleTab[] = [
    { id: "customer", label: "Customer", sections: [{ label: null, accounts: byGroup("customers") }] },
    {
      id: "mechanic",
      label: "Mechanic",
      sections: [
        { label: "Approved mechanics", accounts: byGroup("mechanics") },
        { label: "Other account states", accounts: byGroup("mechanic_states") },
      ],
    },
    { id: "admin", label: "Admin", sections: [{ label: null, accounts: byGroup("admin") }] },
  ];
  const visible = tabs
    .map((tab) => ({ ...tab, sections: tab.sections.filter((section) => section.accounts.length > 0) }))
    .filter((tab) => tab.sections.length > 0);
  const preferred: SampleTabId = next?.startsWith("/mechanic") ? "mechanic" : next?.startsWith("/admin") ? "admin" : "customer";
  const initialTab = visible.some((tab) => tab.id === preferred) ? preferred : (visible[0]?.id ?? "customer");
  return { password: DEMO_PASSWORD, tabs: visible, initialTab };
}

const inlineLink = "font-semibold text-neon-cyan underline underline-offset-2 hover:text-fg";

/** Why a one-click sample login failed (set by demoLoginAction). */
const SAMPLE_LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials:
    'The sample accounts are not in the database right now. Run "npm run db:reset" to recreate the sample data, then try again.',
  rate_limited: "Too many login attempts for this account. Wait a few minutes and try again.",
  account_disabled: "This sample account is disabled.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeNextPath(firstValue(params.next));
  const viewer = await getViewer();
  // One-click logins work only on this computer (demoLoginAction), so a hosted site shows
  // the plain form even if DEMO_MODE is set there.
  const samples = (await sampleLoginsAvailable()) ? sampleLoginData(next) : null;
  const sampleErrorKey = firstValue(params.sample_error);
  const sampleError = samples && sampleErrorKey ? (SAMPLE_LOGIN_ERRORS[sampleErrorKey] ?? null) : null;

  return (
    <AuthShell
      artEyebrow="Welcome back"
      artTitle="Your repairs, quotes and jobs in one place."
      artBody="Pick up where you left off: compare quotes, check a booking or answer a new job."
    >
      <div className="mx-auto max-w-5xl">
        <header className="reveal max-w-xl">
          <p className="font-mono text-xs font-semibold tracking-[0.24em] text-neon-cyan uppercase">Your account</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Log in</h1>
          <p className="mt-3 text-lg text-fg-muted">
            {next
              ? "Log in to continue where you left off."
              : "Welcome back. Log in to manage your repair requests, quotes and jobs."}
          </p>
        </header>
        {viewer ? (
          <Callout tone="info" title={`You're logged in as ${viewer.displayName}`} className="mt-6 max-w-3xl">
            <p>
              Logging in with another account ends this session.{" "}
              <Link href={homePathFor(viewer.role)} className={inlineLink}>
                Continue as {viewer.displayName} ({roleLabels[viewer.role].toLowerCase()})
              </Link>
            </p>
          </Callout>
        ) : null}
        {sampleError ? (
          <Alert tone="danger" title="Sample login didn't work" className="mt-6 max-w-3xl">
            <p>{sampleError}</p>
          </Alert>
        ) : null}
        <div className="mt-8">
          <LoginForm next={next} signupHref={signupPath({ next })} samples={samples} />
        </div>
      </div>
    </AuthShell>
  );
}
