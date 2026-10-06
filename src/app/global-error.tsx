"use client";

import { RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

// Replaces the root layout when it fails, so it renders its own document and avoids the app shell.
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-canvas font-sans text-fg antialiased">
        <title>Something went wrong · WrenchMatch</title>
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="glass relative w-full max-w-lg overflow-hidden rounded-3xl px-6 py-10 text-center sm:px-10">
            <p className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-fg">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-neon-cyan via-brand-500 to-neon-violet text-on-brand shadow-glow-sm"
              >
                <Wrench className="size-[1.125rem]" />
              </span>
              WrenchMatch
            </p>
            <span
              aria-hidden="true"
              className="mx-auto mt-10 grid size-14 place-items-center rounded-2xl border border-warning-500/40 bg-warning-500/10 text-warning-600 shadow-[0_0_28px_-8px_var(--color-warning-600)]"
            >
              <TriangleAlert className="size-7" />
            </span>
            <div role="alert">
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-fg">Something went wrong</h1>
              <p className="mt-4 text-lg text-fg-muted">
                The app hit an unexpected error and could not load. Try again, or reload from the home page.
              </p>
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => retry()} leadingIcon={<RotateCcw />}>
                Try again
              </Button>
              {/* A full page load on purpose: the client router may be what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={buttonClasses({ variant: "secondary" })}>
                Go to the home page
              </a>
            </div>
            {error.digest ? (
              <p className="mt-8 text-sm text-fg-subtle">
                Error reference: <code className="font-mono text-fg">{error.digest}</code>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
