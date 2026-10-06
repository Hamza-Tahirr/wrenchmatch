"use client";

import { LifeBuoy, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { ServerError } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

type SupportErrorProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment. */
  retry: () => void;
};

/** The help page failed to load: try again, or read the FAQ meanwhile. */
export default function SupportError({ error, retry }: SupportErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="narrow" padY={false} className="py-16 text-center sm:py-20">
      <ServerError decorative className="mx-auto w-48 sm:w-56" />
      <div role="alert">
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
          Your help requests couldn&rsquo;t be loaded
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
          Something went wrong on our side. Try again in a moment; the help page answers the most common questions
          meanwhile.
        </p>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={() => retry()} leadingIcon={<RotateCcw />}>
          Try again
        </Button>
        <ButtonLink href="/help" variant="secondary" leadingIcon={<LifeBuoy />}>
          Read the help page
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
