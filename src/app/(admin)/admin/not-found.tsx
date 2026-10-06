import { LayoutDashboard } from "lucide-react";

import { NotFound } from "@/components/illustrations";
import { ButtonLink } from "@/components/ui/button-link";

import { TAP_TARGET } from "./_lib/ui";

/** Shown when an admin record page's id does not exist (or is malformed). */
export default function AdminNotFound() {
  return (
    <div className="glass relative animate-scale-in overflow-hidden rounded-2xl px-6 py-12 text-center sm:py-14">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-neon-violet/70 to-transparent"
      />
      <NotFound decorative className="mx-auto w-48 sm:w-56" />
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-balance text-fg">
        That record wasn&rsquo;t found
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
        The link may be mistyped, or the record may no longer exist. Find it from its list instead.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/admin" leadingIcon={<LayoutDashboard />} className={TAP_TARGET}>
          Go to the dashboard
        </ButtonLink>
        <ButtonLink href="/admin/requests" variant="secondary" className={TAP_TARGET}>
          Requests
        </ButtonLink>
        <ButtonLink href="/admin/mechanics" variant="secondary" className={TAP_TARGET}>
          Mechanics
        </ButtonLink>
      </div>
    </div>
  );
}
