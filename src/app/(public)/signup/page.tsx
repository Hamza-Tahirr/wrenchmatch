import type { Metadata } from "next";
import Link from "next/link";

import { roleLabels } from "@/components/layout/nav-items";
import { Callout } from "@/components/ui/alert";
import { homePathFor, loginPath, sanitizeNextPath, type SignupRole } from "@/server/auth/redirects";
import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/server/auth/validation";
import { getViewer } from "@/server/auth/viewer";
import { AuthShell } from "../login/_components/auth-shell";
import { SignupForm } from "./_components/signup-form";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a WrenchMatch customer account to get repair quotes, or a mechanic account to apply for jobs.",
};

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const inlineLink = "font-semibold text-neon-cyan underline underline-offset-2 hover:text-fg";

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const role: SignupRole = firstValue(params.role) === "mechanic" ? "mechanic" : "customer";
  const next = sanitizeNextPath(firstValue(params.next));
  const viewer = await getViewer();

  return (
    <AuthShell
      artEyebrow={role === "mechanic" ? "For mechanics" : "Join WrenchMatch"}
      artTitle={role === "mechanic" ? "Quote the repair jobs that fit you." : "Get your car quoted, line by line."}
      artBody={
        role === "mechanic"
          ? "Apply once, get approved by our team and receive requests that match your services and area."
          : "Describe the problem, compare itemized quotes from approved mechanics and reserve a slot."
      }
    >
      <div className="mx-auto max-w-2xl">
        <header className="reveal">
          <p className="font-mono text-xs font-semibold tracking-[0.24em] text-neon-cyan uppercase">New account</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Create your account</h1>
          <p className="mt-3 text-lg text-fg-muted">
            Customers get itemized quotes from approved local mechanics. Mechanics apply to receive repair requests that
            fit their services and area.
          </p>
        </header>
        {viewer ? (
          <Callout tone="info" title={`You're logged in as ${viewer.displayName}`} className="mt-6">
            <p>
              Creating a new account ends this session.{" "}
              <Link href={homePathFor(viewer.role)} className={inlineLink}>
                Continue as {viewer.displayName} ({roleLabels[viewer.role].toLowerCase()})
              </Link>
            </p>
          </Callout>
        ) : null}
        <div className="mt-8">
          <SignupForm
            defaultRole={role}
            next={next}
            loginHref={loginPath(next)}
            passwordMinLength={PASSWORD_MIN_LENGTH}
            displayNameMaxLength={DISPLAY_NAME_MAX_LENGTH}
          />
          <p className="mt-4 text-sm text-fg-subtle">
            Each account has one type, which can&rsquo;t be changed later. Admin accounts can&rsquo;t be created by
            signing up.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
