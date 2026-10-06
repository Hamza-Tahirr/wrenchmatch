import { CircleQuestionMark, House } from "lucide-react";
import type { Metadata } from "next";
import { NotFound as NotFoundArt } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <PageContainer size="narrow" padY={false} className="relative isolate py-14 text-center sm:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden">
        <div className="aurora grid-bg size-full opacity-80 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      </div>
      <div aria-hidden="true" className="mx-auto w-56 animate-scale-in sm:w-64">
        <NotFoundArt decorative className="h-auto w-full" />
      </div>
      <p className="mt-6 animate-slide-up font-mono text-sm font-semibold tracking-[0.3em] text-brand-700 uppercase text-glow">
        Error 404
      </p>
      <h1 className="mt-3 animate-slide-up font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-5xl">
        <span className="holo-text">We couldn&rsquo;t find that page</span>
      </h1>
      <p className="mx-auto mt-4 max-w-xl animate-slide-up text-lg text-pretty text-fg-muted [animation-delay:100ms]">
        The link may be mistyped or out of date. If it pointed to a request, quote or booking, it may belong to a
        different account; try logging in with the account that created it.
      </p>
      <div className="mt-8 flex animate-slide-up flex-col justify-center gap-3 [animation-delay:160ms] sm:flex-row">
        <ButtonLink href="/" leadingIcon={<House />}>
          Go to the home page
        </ButtonLink>
        <ButtonLink href="/help" variant="secondary" leadingIcon={<CircleQuestionMark />}>
          Visit the Help Center
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
