import { CircleQuestionMark, House, LogIn, UserPlus } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/illustrations";
import { roleLabels } from "@/components/layout/nav-items";
import { ButtonLink } from "@/components/ui/button-link";
import type { UserRole } from "@/lib/domain";
import { homePathFor, loginPath, parseRoleList, sanitizeNextPath, signupPath } from "@/server/auth/redirects";
import { getViewer } from "@/server/auth/viewer";

export const metadata: Metadata = {
  title: "Not available for your account",
  robots: { index: false, follow: false },
};

type AccessDeniedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const AREA_COPY: Record<UserRole, { title: string; body: string }> = {
  customer: {
    title: "This page is for customer accounts",
    body: "Customers send repair requests, compare quotes and manage their reservations.",
  },
  mechanic: {
    title: "This page is for mechanic accounts",
    body: "Mechanics apply to join, manage their profile and quote on repair requests matched to them.",
  },
  admin: {
    title: "This page is for administrators",
    body: "Admin tools are only for WrenchMatch staff accounts, and admin accounts can't be created by signing up.",
  },
};

function joinWithOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const params = await searchParams;
  const needed = parseRoleList(firstValue(params.need));
  const from = sanitizeNextPath(firstValue(params.from));
  const viewer = await getViewer();

  const single = needed.length === 1 ? AREA_COPY[needed[0]] : null;
  const neededLabels = needed.map((role) => roleLabels[role].toLowerCase());
  const title =
    single?.title ??
    (needed.length > 1
      ? `This page is for ${joinWithOr(neededLabels)} accounts`
      : "This page isn't available for your account");
  const viewerRoleLabel = viewer ? roleLabels[viewer.role].toLowerCase() : null;
  // A customer who wants to offer repairs (or the reverse) needs a separate account.
  const signupRole = needed.find((role): role is "customer" | "mechanic" => role === "customer" || role === "mechanic");

  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_26rem_at_50%_18%,rgba(139,92,246,0.22),transparent_65%),radial-gradient(36rem_22rem_at_50%_70%,rgba(34,211,238,0.12),transparent_65%)]"
      />
      <div aria-hidden="true" className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-70" />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-20">
        <AccessDenied decorative className="reveal-scale mx-auto w-56 sm:w-72" />
        <p className="mt-4 font-mono text-xs font-semibold tracking-[0.24em] text-warning-700 uppercase">
          Not available for your account
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-5xl">{title}</h1>
        <div className="mx-auto mt-5 max-w-xl space-y-3 text-lg text-pretty text-fg-muted">
          {single ? <p>{single.body}</p> : null}
          {viewer && viewerRoleLabel ? (
            <p>
              You&rsquo;re logged in as <strong className="font-semibold text-fg">{viewer.displayName}</strong>,{" "}
              {articleFor(viewerRoleLabel)} {viewerRoleLabel} account. Each account has one type, so to use this page,
              log in with {needed.length > 0 ? `${articleFor(neededLabels[0])} ${joinWithOr(neededLabels)}` : "a different"}{" "}
              account.
            </p>
          ) : (
            <p>Log in with an account that can use this page.</p>
          )}
        </div>
        <div className="glass mx-auto mt-9 flex max-w-2xl flex-col justify-center gap-3 rounded-3xl p-4 sm:flex-row sm:flex-wrap sm:p-5">
          {viewer ? (
            <ButtonLink href={homePathFor(viewer.role)} leadingIcon={<House />}>
              Go to your {viewerRoleLabel} home
            </ButtonLink>
          ) : null}
          <ButtonLink href={loginPath(from)} variant={viewer ? "secondary" : "primary"} leadingIcon={<LogIn />}>
            {viewer ? "Log in with a different account" : "Log in"}
          </ButtonLink>
          {signupRole && signupRole !== viewer?.role ? (
            <ButtonLink href={signupPath({ role: signupRole, next: from })} variant="secondary" leadingIcon={<UserPlus />}>
              Create {articleFor(signupRole)} {signupRole} account
            </ButtonLink>
          ) : null}
          <ButtonLink href="/help#getting-started" variant="ghost" leadingIcon={<CircleQuestionMark />}>
            Help and getting started
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
