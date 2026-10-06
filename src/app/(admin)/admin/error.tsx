"use client";

import { LayoutDashboard, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { ServerError } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

import { TAP_TARGET } from "./_lib/ui";

type AdminErrorProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment. */
  retry: () => void;
};

export default function AdminError({ error, retry }: AdminErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="glass relative animate-scale-in overflow-hidden rounded-2xl px-6 py-12 text-center sm:py-14">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-warning-500/70 to-transparent"
      />
      <ServerError decorative className="mx-auto w-48 sm:w-56" />
      <div role="alert">
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-balance text-fg">
          This admin page couldn&rsquo;t be loaded
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
          Nothing was changed. Try again; if it keeps happening, go back to the dashboard and check the server log.
        </p>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={() => retry()} leadingIcon={<RotateCcw />} className={TAP_TARGET}>
          Try again
        </Button>
        <ButtonLink href="/admin" variant="secondary" leadingIcon={<LayoutDashboard />} className={TAP_TARGET}>
          Go to the dashboard
        </ButtonLink>
      </div>
      {error.digest ? (
        <p className="mt-8 text-sm text-fg-subtle">
          Error reference: <code className="font-mono text-fg">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
