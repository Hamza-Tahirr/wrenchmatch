"use client";

import { ClipboardList, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { ServerError } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

type MechanicErrorProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment. */
  retry: () => void;
};

export default function MechanicError({ error, retry }: MechanicErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="narrow" padY={false} className="py-12 text-center sm:py-16">
      <div className="glass aurora relative overflow-hidden rounded-3xl px-5 py-10 sm:px-10">
        <ServerError decorative className="mx-auto w-52 sm:w-60" />
        <div role="alert">
          <h1 className="holo-text mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            This page couldn&rsquo;t be loaded
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
            Nothing was changed. Try again; if it keeps happening, go back to your job board.
          </p>
        </div>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => retry()} leadingIcon={<RotateCcw />}>
            Try again
          </Button>
          <ButtonLink href="/mechanic/jobs" variant="secondary" leadingIcon={<ClipboardList />}>
            Go to the job board
          </ButtonLink>
        </div>
        {error.digest ? (
          <p className="mt-8 text-sm text-fg-muted">
            Error reference: <code className="font-mono text-fg">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}
