"use client";

import { ClipboardList, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { ServerError } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

type CustomerErrorProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment. */
  retry: () => void;
};

/** A customer page that failed to load: try again, or go back to the request list. */
export default function CustomerError({ error, retry }: CustomerErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="narrow" padY={false} className="py-16 text-center sm:py-20">
      <ServerError decorative className="mx-auto w-48 sm:w-56" />
      <div role="alert">
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
          This page couldn&rsquo;t be loaded
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
          Something went wrong on our side. Try again; if it keeps happening, go back to your requests and open it
          from there.
        </p>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={() => retry()} leadingIcon={<RotateCcw />}>
          Try again
        </Button>
        <ButtonLink href="/quotes" variant="secondary" leadingIcon={<ClipboardList />}>
          Go to your requests
        </ButtonLink>
      </div>
      {error.digest ? (
        <p className="mt-8 text-sm text-fg-subtle">
          Error reference: <code className="font-mono text-fg">{error.digest}</code>
        </p>
      ) : null}
    </PageContainer>
  );
}
