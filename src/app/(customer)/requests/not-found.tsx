import { ClipboardList, Plus } from "lucide-react";
import type { Metadata } from "next";

import { NotFound } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Request not found" };

/**
 * Unknown request or quote ids, and other customers' requests: the page never says which,
 * so ids can't be probed.
 */
export default function RequestNotFound() {
  return (
    <PageContainer size="narrow" padY={false} className="py-16 text-center sm:py-20">
      <NotFound decorative className="mx-auto w-48 sm:w-56" />
      <p className="mt-6 font-mono text-xs font-medium tracking-[0.2em] text-brand-700 uppercase">Error 404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
        Request not found
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
        You can open only your own repair requests and their quotes. The link may be mistyped, or it belongs to a
        different account.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/quotes" leadingIcon={<ClipboardList />}>
          See your requests
        </ButtonLink>
        <ButtonLink href="/request" variant="secondary" leadingIcon={<Plus />}>
          Request a repair
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
