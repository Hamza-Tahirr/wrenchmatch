"use client";

import { House, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { ServerError } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment. */
  retry: () => void;
};

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="narrow" padY={false} className="relative isolate py-14 text-center sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-6 -z-10 mx-auto h-72 max-w-lg rounded-full bg-warning-500/10 blur-3xl"
      />
      <div aria-hidden="true" className="mx-auto w-56 animate-scale-in sm:w-64">
        <ServerError decorative className="h-auto w-full" />
      </div>
      <div role="alert">
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-pretty text-fg-muted">
          This page could not be shown. Trying again often helps; if it keeps happening, go back to the home page and
          start from there.
        </p>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={() => retry()} leadingIcon={<RotateCcw />}>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary" leadingIcon={<House />}>
          Go to the home page
        </ButtonLink>
      </div>
      {error.digest ? (
        <p className="mt-8 text-sm text-fg-subtle">
          Error reference: <code className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 font-mono text-fg">{error.digest}</code>
        </p>
      ) : null}
    </PageContainer>
  );
}
